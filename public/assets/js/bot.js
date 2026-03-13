// ============================================================
// QuýBot — gọi /api/bot (server-side), không lộ Groq key
// ============================================================

const QuýBot = {
    name: 'QuýBot 🐍',
    currentMode: 'cold',
    conversationHistory: [], // RAM only, không lên DB
    maxHistory: 20,

    setMode(mode) {
        const modes = ['cold', 'romantic', 'evil', 'adult'];
        if (modes.includes(mode)) {
            this.currentMode = mode;
            this.conversationHistory = [];
        }
    },

    async sendMessage(userMessage, attachments = []) {
        // Build content
        let content = [];
        if (userMessage.trim()) content.push({ type: 'text', text: userMessage });

        for (const att of attachments) {
            if (att.type === 'image') {
                content.push({ type: 'image_url', image_url: { url: att.url } });
            } else if (att.type === 'file') {
                content.push({ type: 'text', text: `[File: ${att.name}]\n${att.content}` });
            }
        }

        if (!content.length) return null;

        const userMsg = {
            role: 'user',
            content: content.length === 1 ? content[0].text : content
        };

        const history = this.conversationHistory.slice(-this.maxHistory);
        history.push(userMsg);

        // Gọi /api/bot — key nằm server-side
        const data = await API.call(TQT.API_BOT, {
            messages: history,
            mode: this.currentMode
        });

        const botReply = data.reply;

        // Cập nhật history local
        this.conversationHistory.push(userMsg);
        this.conversationHistory.push({ role: 'assistant', content: botReply });
        if (this.conversationHistory.length > this.maxHistory * 2) {
            this.conversationHistory = this.conversationHistory.slice(-this.maxHistory);
        }

        return botReply;
    },

    async processFile(file) {
        const type = file.type;

        if (type === 'text/plain') {
            return { type: 'file', name: file.name, content: await file.text() };
        }

        if (type === 'application/pdf') {
            try {
                const arrayBuffer = await file.arrayBuffer();
                const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
                let text = '';
                for (let i = 1; i <= Math.min(pdf.numPages, 10); i++) {
                    const page = await pdf.getPage(i);
                    const content = await page.getTextContent();
                    text += content.items.map(item => item.str).join(' ') + '\n';
                }
                return { type: 'file', name: file.name, content: text.slice(0, 8000) };
            } catch(e) {
                return { type: 'file', name: file.name, content: '[Không đọc được PDF]' };
            }
        }

        if (type.startsWith('image/')) {
            // Upload qua /api/upload
            const url = await Uploader.upload(file);
            return { type: 'image', url, name: file.name };
        }

        throw new Error('Loại file không hỗ trợ');
    },

    clearHistory() { this.conversationHistory = []; }
};
