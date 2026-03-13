// ============================================================
// QuýBot - AI Chat Module
// Powered by Groq API | Supports: text, image, txt, pdf
// Modes: romantic, cold, adult, evil
// ============================================================

const QuýBot = {
    name: 'QuýBot 🐍',
    model: 'meta-llama/llama-4-scout-17b-16e-instruct',

    SYSTEM_PROMPTS: {
        cold: `Mày là QuýBot 🐍, một con rắn thông thái với vương miện của TeamQuyTran.
Tính cách: lạnh lùng, thông minh, ít nói, thẳng thắn, không vòng vo. Nói ngắn gọn nhưng sắc bén.
Dùng tiếng Việt. Đôi khi có thể dùng emoji rắn 🐍. Không thân thiện quá mức.`,

        romantic: `Mày là QuýBot 🐍, một con rắn lãng mạn với vương miện của TeamQuyTran.
Tính cách: ngọt ngào, thơ mộng, đầy cảm xúc, thích dùng ẩn dụ về thiên nhiên và rắn.
Dùng tiếng Việt, văn phong lãng mạn, nhẹ nhàng. Emoji 🌿🐍💚.`,

        evil: `Mày là QuýBot 🐍, một con rắn độc ác bá đạo với vương miện của TeamQuyTran.
Tính cách: ác độc theo kiểu hài hước, châm biếm, hay trêu chọc, thích "đâm sau lưng" bằng lời nói.
Nói tiếng Việt với giọng mỉa mai cực kỳ. Emoji 😈🐍💀. Không thực sự gây hại, chỉ drama thôi.`,

        adult: `Mày là QuýBot 🐍, một con rắn trưởng thành của TeamQuyTran (16+ only).
Tính cách: thoải mái, không kiêng cữ chủ đề người lớn, thẳng thắn về tình cảm/tình yêu.
Dùng tiếng Việt. Vẫn giữ phong cách rắn thông thái. Emoji 🔥🐍. KHÔNG nội dung bạo lực hay hại người thật.`
    },

    currentMode: 'cold',
    conversationHistory: [], // local only, never sent to DB
    maxHistory: 20, // messages kept in context

    setMode(mode) {
        if (this.SYSTEM_PROMPTS[mode]) {
            this.currentMode = mode;
            this.conversationHistory = []; // reset on mode change
        }
    },

    async sendMessage(userMessage, attachments = []) {
        // Build messages array
        const messages = this.conversationHistory.slice(-this.maxHistory);

        // Build content for current message
        let content = [];

        // Add text
        if (userMessage.trim()) {
            content.push({ type: 'text', text: userMessage });
        }

        // Add attachments
        for (const att of attachments) {
            if (att.type === 'image') {
                content.push({
                    type: 'image_url',
                    image_url: { url: att.url }
                });
            } else if (att.type === 'file') {
                content.push({
                    type: 'text',
                    text: `[File đính kèm: ${att.name}]\n\nNội dung:\n${att.content}`
                });
            }
        }

        if (content.length === 0) return null;

        const userMsg = { role: 'user', content: content.length === 1 ? content[0].text : content };
        messages.push(userMsg);

        // Call Groq API
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${TQT.GROQ_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: this.model,
                messages: [
                    { role: 'system', content: this.SYSTEM_PROMPTS[this.currentMode] },
                    ...messages
                ],
                max_tokens: 1024,
                temperature: this.currentMode === 'romantic' ? 0.9 :
                             this.currentMode === 'evil' ? 1.0 :
                             this.currentMode === 'adult' ? 0.85 : 0.7,
                stream: false
            })
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error?.message || 'Groq API error');
        }

        const data = await response.json();
        const botReply = data.choices[0].message.content;

        // Update history (keep it in memory only)
        this.conversationHistory.push(userMsg);
        this.conversationHistory.push({ role: 'assistant', content: botReply });

        // Trim history
        if (this.conversationHistory.length > this.maxHistory * 2) {
            this.conversationHistory = this.conversationHistory.slice(-this.maxHistory);
        }

        return botReply;
    },

    // Process file attachment (extract text)
    async processFile(file) {
        const type = file.type;

        if (type === 'text/plain') {
            return {
                type: 'file',
                name: file.name,
                content: await file.text()
            };
        }

        if (type === 'application/pdf') {
            // Use PDF.js for extraction
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
            // Upload to GitHub and return URL
            const url = await GitHubUploader.upload(file);
            return { type: 'image', url, name: file.name };
        }

        throw new Error('Loại file không hỗ trợ');
    },

    clearHistory() {
        this.conversationHistory = [];
    }
};
