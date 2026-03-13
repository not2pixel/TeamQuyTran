// ============================================================
// TeamQuyTran - Core
// ============================================================

const TQT = {
    SUPABASE_URL:      'https://sfqlaxcxenndevprhmci.supabase.co',
    SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNmcWxheGN4ZW5uZGV2cHJobWNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgwMjk5MjMsImV4cCI6MjA3MzYwNTkyM30.lx4FTXvQj7tj7zz8u9gK3bVdaaFPtIC_sWnuxUxcSG8',
    API_BOT:     '/api/bot',
    API_UPLOAD:  '/api/upload',
    API_APPROVE: '/api/approve-user',
    APP_NAME: 'TeamQuyTran',
    BOT_NAME: 'QuýBot',
    MAX_FILE_SIZE: 8 * 1024 * 1024,
    ALLOWED_FILE_TYPES: ['image/png', 'image/jpeg', 'text/plain', 'application/pdf'],
    LOCAL_HISTORY_LIMIT: 500,
};

// ============================================================
// SUPABASE CLIENT
// Vấn đề: window.supabase từ CDN là non-configurable property
// → KHÔNG dùng Object.defineProperty, dùng tên riêng _db
// ============================================================
let _db = null;

function initSupabase() {
    if (_db) return _db;
    // window.supabase = CDN namespace {createClient, ...} — KHÔNG override nó
    _db = window.supabase.createClient(TQT.SUPABASE_URL, TQT.SUPABASE_ANON_KEY, {
        realtime: { params: { eventsPerSecond: 10 } }
    });
    return _db;
}

// Getter ngắn — dùng db() thay vì window.supabase ở mọi nơi
function db() {
    if (!_db) initSupabase();
    return _db;
}

// ============================================================
// API HELPER
// ============================================================
const API = {
    async call(endpoint, body) {
        let token = null;
        try {
            const s = await db().auth.getSession();
            token = s?.data?.session?.access_token;
        } catch(e) {}

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
// LOCAL STORAGE
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
    setUser(u) { try { localStorage.setItem(`${this.prefix}user`, JSON.stringify(u)); } catch(e) {} },
    getUser()  { try { return JSON.parse(localStorage.getItem(`${this.prefix}user`) || 'null'); } catch(e) { return null; } },
    clear() { Object.keys(localStorage).filter(k => k.startsWith(this.prefix)).forEach(k => localStorage.removeItem(k)); },
    setItem(key, val) { try { localStorage.setItem(`${this.prefix}${key}`, JSON.stringify(val)); } catch(e) {} },
    getItem(key, def = null) { try { return JSON.parse(localStorage.getItem(`${this.prefix}${key}`)) ?? def; } catch(e) { return def; } }
};

// ============================================================
// AUTH — dùng db() thay vì window.supabase
// ============================================================
window.Auth = {
    async getSession() {
        const { data } = await db().auth.getSession();
        return data?.session ?? null;
    },
    async getProfile(userId) {
        const { data } = await db().from('profiles').select('*').eq('id', userId).single();
        return data;
    },
    async signOut() {
        try {
            const s = await this.getSession();
            if (s?.user?.id)
                await db().from('profiles').update({ status: 'offline' }).eq('id', s.user.id);
        } catch(e) {}
        await db().auth.signOut();
        LocalCache.clear();
        window.location.replace('/LogIn/');
    },
    async requireAuth() {
        const s = await this.getSession();
        if (!s) window.location.replace('/LogIn/');
        return s;
    },
    async redirectIfAuth() {
        const s = await this.getSession();
        if (s) window.location.replace('/app/');
    }
};

// ============================================================
// UPLOADER
// ============================================================
const Uploader = {
    async upload(file) {
        const base64 = await new Promise((res, rej) => {
            const r = new FileReader();
            r.onload = () => res(r.result.split(',')[1]);
            r.onerror = rej;
            r.readAsDataURL(file);
        });
        return (await API.call(TQT.API_UPLOAD, { filename: file.name, base64, mimeType: file.type })).url;
    }
};

// ============================================================
// MARKDOWN
// ============================================================
const MD = {
    render(text) {
        if (!text) return '';
        let h = this.escape(text);
        h = h.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => `<pre class="code-block"><code class="${lang}">${code.trim()}</code></pre>`);
        h = h.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
        h = h.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        h = h.replace(/__(.+?)__/g, '<strong>$1</strong>');
        h = h.replace(/\*(.+?)\*/g, '<em>$1</em>');
        h = h.replace(/~~(.+?)~~/g, '<del>$1</del>');
        h = h.replace(/^&gt; (.+)/gm, '<blockquote>$1</blockquote>');
        h = h.replace(/^### (.+)/gm, '<h3>$1</h3>');
        h = h.replace(/^## (.+)/gm, '<h2>$1</h2>');
        h = h.replace(/^# (.+)/gm, '<h1>$1</h1>');
        h = h.replace(/\[(.+?)\]\((https?:\/\/[^\)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
        h = h.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
        h = h.replace(/\|\|(.+?)\|\|/g, '<span class="spoiler">$1</span>');
        h = h.replace(/\n/g, '<br>');
        return h;
    },
    escape(t) { return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
};

// ============================================================
// TOAST
// ============================================================
const Toast = {
    _c: null,
    _ensure() {
        if (!this._c) {
            this._c = document.createElement('div');
            this._c.id = 'toast-container';
            document.body.appendChild(this._c);
        }
    },
    show(msg, type = 'info', duration = 3500) {
        this._ensure();
        const t = document.createElement('div');
        t.className = `toast toast-${type}`;
        t.innerHTML = `<span class="toast-icon">${{info:'ℹ',success:'✓',error:'✕',warn:'⚠'}[type]||'ℹ'}</span><span>${msg}</span>`;
        this._c.appendChild(t);
        requestAnimationFrame(() => t.classList.add('show'));
        setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, duration);
    },
    success(msg) { this.show(msg, 'success'); },
    error(msg)   { this.show(msg, 'error'); },
    warn(msg)    { this.show(msg, 'warn'); },
    info(msg)    { this.show(msg, 'info'); }
};

// ============================================================
// TIME
// ============================================================
const TimeUtil = {
    format(date) {
        const d = new Date(date), now = new Date(), diff = (now - d) / 1000;
        if (diff < 60)     return 'Vừa xong';
        if (diff < 3600)   return `${Math.floor(diff/60)} phút trước`;
        if (diff < 86400)  return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
        if (diff < 604800) return d.toLocaleDateString('vi-VN', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
        return d.toLocaleDateString('vi-VN');
    }
};

// ============================================================
// INIT — chạy ngay khi script load
// ============================================================
initSupabase();
