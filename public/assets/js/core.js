// ============================================================
// TeamQuyTran - Core Config (SAFE — no secrets here)
// Tất cả sensitive keys nằm ở Vercel Environment Variables
// ============================================================

const TQT = {
    // Supabase anon key là PUBLIC — OK để ở client (RLS bảo vệ data)
    SUPABASE_URL: 'https://YOUR_PROJECT.supabase.co',
    SUPABASE_ANON_KEY: 'YOUR_ANON_KEY',

    // Internal API routes (keys nằm trong Vercel env, không lộ)
    API_BOT: '/api/bot',
    API_UPLOAD: '/api/upload',
    API_APPROVE: '/api/approve-user',

    APP_NAME: 'TeamQuyTran',
    BOT_NAME: 'QuýBot',
    MAX_FILE_SIZE: 8 * 1024 * 1024,
    ALLOWED_FILE_TYPES: ['image/png', 'image/jpeg', 'text/plain', 'application/pdf'],
    LOCAL_HISTORY_LIMIT: 500,
};

// ============================================================
// SUPABASE CLIENT
// ============================================================
let supabase;
function initSupabase() {
    supabase = window.supabase.createClient(TQT.SUPABASE_URL, TQT.SUPABASE_ANON_KEY, {
        realtime: { params: { eventsPerSecond: 10 } }
    });
    return supabase;
}

// ============================================================
// API HELPER — tự động đính kèm Supabase JWT
// ============================================================
const API = {
    async call(endpoint, body) {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;

        const res = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { 'Authorization': `Bearer ${token}` } : {})
            },
            body: JSON.stringify(body)
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || `API error ${res.status}`);
        }

        return res.json();
    }
};

// ============================================================
// LOCAL STORAGE - Chat History Cache
// ============================================================
const LocalCache = {
    prefix: 'tqt_',

    setMessages(channelId, messages) {
        try { localStorage.setItem(`${this.prefix}ch_${channelId}`, JSON.stringify(messages.slice(-TQT.LOCAL_HISTORY_LIMIT))); } catch(e) {}
    },

    getMessages(channelId) {
        try { return JSON.parse(localStorage.getItem(`${this.prefix}ch_${channelId}`) || '[]'); } catch(e) { return []; }
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
        await supabase.from('profiles').update({ status: 'offline' }).eq('id', (await this.getSession())?.user?.id);
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
// FILE UPLOADER — gọi /api/upload thay vì GitHub trực tiếp
// ============================================================
const Uploader = {
    async upload(file) {
        // Convert to base64
        const base64 = await new Promise((res, rej) => {
            const r = new FileReader();
            r.onload = () => res(r.result.split(',')[1]); // strip data:... prefix
            r.onerror = rej;
            r.readAsDataURL(file);
        });

        const data = await API.call(TQT.API_UPLOAD, {
            filename: file.name,
            base64,
            mimeType: file.type
        });

        return data.url;
    }
};

// ============================================================
// MARKDOWN RENDERER
// ============================================================
const MD = {
    render(text) {
        if (!text) return '';
        let html = this.escape(text);
        html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => `<pre class="code-block"><code class="${lang}">${code.trim()}</code></pre>`);
        html = html.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
        html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');
        html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
        html = html.replace(/_(.+?)_/g, '<em>$1</em>');
        html = html.replace(/~~(.+?)~~/g, '<del>$1</del>');
        html = html.replace(/^&gt; (.+)/gm, '<blockquote>$1</blockquote>');
        html = html.replace(/^### (.+)/gm, '<h3>$1</h3>');
        html = html.replace(/^## (.+)/gm, '<h2>$1</h2>');
        html = html.replace(/^# (.+)/gm, '<h1>$1</h1>');
        html = html.replace(/\[(.+?)\]\((https?:\/\/[^\)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
        html = html.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
        html = html.replace(/\|\|(.+?)\|\|/g, '<span class="spoiler">$1</span>');
        html = html.replace(/\n/g, '<br>');
        return html;
    },
    escape(text) {
        return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
};

// ============================================================
// TOAST
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
        const d = new Date(date), now = new Date(), diff = (now - d) / 1000;
        if (diff < 60) return 'Vừa xong';
        if (diff < 3600) return `${Math.floor(diff/60)} phút trước`;
        if (diff < 86400) return d.toLocaleTimeString('vi-VN', {hour:'2-digit', minute:'2-digit'});
        if (diff < 604800) return d.toLocaleDateString('vi-VN', {weekday:'short', hour:'2-digit', minute:'2-digit'});
        return d.toLocaleDateString('vi-VN');
    }
};

document.addEventListener('DOMContentLoaded', () => { initSupabase(); Toast.init(); });
