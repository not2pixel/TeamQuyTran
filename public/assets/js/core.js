// ============================================================
// TeamQuyTran - Core Config & Utilities
// public/assets/js/core.js
// ============================================================

const TQT = {
    // === SUPABASE CONFIG (replace with yours) ===
    SUPABASE_URL: 'https://YOUR_PROJECT.supabase.co',
    SUPABASE_ANON_KEY: 'YOUR_ANON_KEY',

    // === GROQ CONFIG ===
    GROQ_API_KEY: 'YOUR_GROQ_API_KEY',
    GROQ_MODEL: 'meta-llama/llama-4-scout-17b-16e-instruct', // supports vision

    // === GITHUB IMAGE HOST ===
    GITHUB_TOKEN: 'YOUR_GITHUB_PAT',
    GITHUB_REPO: 'YOUR_USERNAME/teamquytran-assets',
    GITHUB_BRANCH: 'main',

    // === APP INFO ===
    APP_NAME: 'TeamQuyTran',
    APP_VERSION: '1.0.0',
    BOT_NAME: 'QuýBot',
    MAX_FILE_SIZE: 8 * 1024 * 1024, // 8MB
    ALLOWED_FILE_TYPES: ['image/png', 'image/jpeg', 'text/plain', 'application/pdf'],
    LOCAL_HISTORY_LIMIT: 500, // messages per channel stored locally
};

// ============================================================
// SUPABASE CLIENT
// ============================================================
let supabase;
function initSupabase() {
    if (typeof window.supabase !== 'undefined') {
        supabase = window.supabase.createClient(TQT.SUPABASE_URL, TQT.SUPABASE_ANON_KEY, {
            realtime: { params: { eventsPerSecond: 10 } }
        });
    }
    return supabase;
}

// ============================================================
// LOCAL STORAGE - Chat History Cache
// ============================================================
const LocalCache = {
    prefix: 'tqt_',

    setMessages(channelId, messages) {
        const key = `${this.prefix}ch_${channelId}`;
        const trimmed = messages.slice(-TQT.LOCAL_HISTORY_LIMIT);
        try { localStorage.setItem(key, JSON.stringify(trimmed)); } catch(e) {}
    },

    getMessages(channelId) {
        const key = `${this.prefix}ch_${channelId}`;
        try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch(e) { return []; }
    },

    appendMessage(channelId, msg) {
        const msgs = this.getMessages(channelId);
        msgs.push(msg);
        this.setMessages(channelId, msgs);
    },

    setUser(user) {
        try { localStorage.setItem(`${this.prefix}user`, JSON.stringify(user)); } catch(e) {}
    },

    getUser() {
        try { return JSON.parse(localStorage.getItem(`${this.prefix}user`) || 'null'); } catch(e) { return null; }
    },

    clear() {
        Object.keys(localStorage).filter(k => k.startsWith(this.prefix)).forEach(k => localStorage.removeItem(k));
    },

    setItem(key, val) {
        try { localStorage.setItem(`${this.prefix}${key}`, JSON.stringify(val)); } catch(e) {}
    },

    getItem(key, def = null) {
        try { return JSON.parse(localStorage.getItem(`${this.prefix}${key}`)) ?? def; } catch(e) { return def; }
    }
};

// ============================================================
// AUTH HELPERS
// ============================================================
const Auth = {
    async getSession() {
        const { data: { session } } = await supabase.auth.getSession();
        return session;
    },

    async getProfile(userId) {
        const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
        return data;
    },

    async signOut() {
        await supabase.auth.signOut();
        LocalCache.clear();
        window.location.href = '/LogIn/';
    },

    requireAuth() {
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (!session) window.location.href = '/LogIn/';
        });
    },

    redirectIfAuth() {
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session) window.location.href = '/app/';
        });
    }
};

// ============================================================
// GITHUB IMAGE UPLOADER
// ============================================================
const GitHubUploader = {
    async upload(file, filename) {
        if (!TQT.GITHUB_TOKEN || TQT.GITHUB_TOKEN === 'YOUR_GITHUB_PAT') {
            throw new Error('GitHub token not configured');
        }

        const ext = file.name.split('.').pop();
        const name = filename || `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
        const path = `uploads/${new Date().toISOString().slice(0,7)}/${name}`;

        const base64 = await this.toBase64(file);
        const res = await fetch(`https://api.github.com/repos/${TQT.GITHUB_REPO}/contents/${path}`, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${TQT.GITHUB_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: `Upload ${name}`,
                content: base64.split(',')[1],
                branch: TQT.GITHUB_BRANCH
            })
        });

        if (!res.ok) throw new Error('Upload failed');
        const data = await res.json();
        return `https://raw.githubusercontent.com/${TQT.GITHUB_REPO}/${TQT.GITHUB_BRANCH}/${path}`;
    },

    toBase64(file) {
        return new Promise((res, rej) => {
            const r = new FileReader();
            r.onload = () => res(r.result);
            r.onerror = rej;
            r.readAsDataURL(file);
        });
    }
};

// ============================================================
// MARKDOWN RENDERER (minimal, no deps)
// ============================================================
const MD = {
    render(text) {
        if (!text) return '';
        let html = this.escape(text);

        // Code blocks
        html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) =>
            `<pre class="code-block"><code class="${lang}">${code.trim()}</code></pre>`);

        // Inline code
        html = html.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');

        // Bold
        html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');

        // Italic
        html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
        html = html.replace(/_(.+?)_/g, '<em>$1</em>');

        // Strikethrough
        html = html.replace(/~~(.+?)~~/g, '<del>$1</del>');

        // Blockquote
        html = html.replace(/^&gt; (.+)/gm, '<blockquote>$1</blockquote>');

        // Headers
        html = html.replace(/^### (.+)/gm, '<h3>$1</h3>');
        html = html.replace(/^## (.+)/gm, '<h2>$1</h2>');
        html = html.replace(/^# (.+)/gm, '<h1>$1</h1>');

        // Links
        html = html.replace(/\[(.+?)\]\((https?:\/\/[^\)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

        // Bare URLs
        html = html.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');

        // Spoiler
        html = html.replace(/\|\|(.+?)\|\|/g, '<span class="spoiler">$1</span>');

        // Newlines
        html = html.replace(/\n/g, '<br>');

        return html;
    },

    escape(text) {
        return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
};

// ============================================================
// TOAST NOTIFICATIONS
// ============================================================
const Toast = {
    container: null,

    init() {
        this.container = document.createElement('div');
        this.container.id = 'toast-container';
        document.body.appendChild(this.container);
    },

    show(msg, type = 'info', duration = 3500) {
        if (!this.container) this.init();
        const t = document.createElement('div');
        t.className = `toast toast-${type}`;
        t.innerHTML = `<span class="toast-icon">${{info:'ℹ',success:'✓',error:'✕',warn:'⚠'}[type]||'ℹ'}</span><span>${msg}</span>`;
        this.container.appendChild(t);
        requestAnimationFrame(() => t.classList.add('show'));
        setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, duration);
    },

    success(msg) { this.show(msg, 'success'); },
    error(msg) { this.show(msg, 'error'); },
    warn(msg) { this.show(msg, 'warn'); },
    info(msg) { this.show(msg, 'info'); }
};

// ============================================================
// TIME FORMATTING
// ============================================================
const TimeUtil = {
    format(date) {
        const d = new Date(date);
        const now = new Date();
        const diff = (now - d) / 1000;

        if (diff < 60) return 'Vừa xong';
        if (diff < 3600) return `${Math.floor(diff/60)} phút trước`;
        if (diff < 86400) return d.toLocaleTimeString('vi-VN', {hour:'2-digit', minute:'2-digit'});
        if (diff < 604800) return d.toLocaleDateString('vi-VN', {weekday:'short', hour:'2-digit', minute:'2-digit'});
        return d.toLocaleDateString('vi-VN');
    },

    timestamp(date) {
        return new Date(date).toLocaleString('vi-VN');
    }
};

// Init
document.addEventListener('DOMContentLoaded', () => {
    initSupabase();
    Toast.init();
});
