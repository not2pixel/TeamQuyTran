# 🐍 TeamQuyTran — Setup Guide

## Cấu trúc dự án
```
teamquytran/
├── public/
│   ├── LogIn/index.html         → web.com/LogIn
│   ├── Register/index.html      → web.com/Register
│   ├── app/index.html           → web.com/app (main app)
│   └── assets/
│       ├── css/global.css
│       └── js/
│           ├── core.js          (Supabase, cache, utilities)
│           └── bot.js           (QuýBot Groq AI)
├── api/
│   └── approve-user.js          → web.com/api/approve-user
├── docs/
│   └── migration.sql
└── vercel.json
```

---

## BƯỚC 1 — Supabase Setup

1. Tạo project tại [supabase.com](https://supabase.com)
2. Vào **SQL Editor** → chạy toàn bộ `docs/migration.sql`
3. Lấy **Project URL** và **anon key** từ Settings > API

### Tạo tài khoản Admin đầu tiên:
```
Supabase Dashboard > Authentication > Users > Add User
  Email: admin@yoursite.com
  Password: (chọn mạnh)
  Auto Confirm: ✓

Sau đó chạy SQL:
UPDATE profiles SET role = 'admin', display_name = 'Administrator' 
WHERE id = (SELECT id FROM auth.users WHERE email = 'admin@yoursite.com');
```

---

## BƯỚC 2 — GitHub Image Hosting

1. Tạo repo **public** tên `teamquytran-assets`
2. Settings > Developer Settings > Personal Access Tokens > Classic
   - Scope: `repo` (full)
3. Lưu token

---

## BƯỚC 3 — Groq API Key

1. [console.groq.com](https://console.groq.com) → Create API Key
2. Model được dùng: `meta-llama/llama-4-scout-17b-16e-instruct` (hỗ trợ vision)

---

## BƯỚC 4 — Cấu hình `public/assets/js/core.js`

Mở file và thay:
```javascript
SUPABASE_URL: 'https://YOUR_PROJECT.supabase.co',
SUPABASE_ANON_KEY: 'YOUR_ANON_KEY',
GROQ_API_KEY: 'YOUR_GROQ_API_KEY',
GITHUB_TOKEN: 'YOUR_GITHUB_PAT',
GITHUB_REPO: 'YOUR_USERNAME/teamquytran-assets',
```

---

## BƯỚC 5 — Deploy lên Vercel

```bash
npm install -g vercel
cd teamquytran
vercel deploy

# Sau khi deploy, thêm environment variables:
# SUPABASE_URL=...
# SUPABASE_SERVICE_ROLE_KEY=...  (cho API approve-user)
```

Hoặc dùng Vercel Dashboard:
1. Import GitHub repo
2. Framework: **Other** (static)
3. Root directory: `public`
4. Add env vars

---

## Tính năng đã có

| Tính năng | Trạng thái |
|-----------|-----------|
| Đăng nhập / Đăng xuất | ✅ |
| Đăng ký (gửi request admin) | ✅ |
| Admin duyệt signup | ✅ |
| Tạo server / kênh | ✅ |
| Chat realtime | ✅ |
| Markdown support | ✅ |
| Reply tin nhắn | ✅ |
| Xóa / Sửa tin nhắn | ✅ |
| Emoji reactions | ✅ |
| Status online/idle/dnd/offline | ✅ |
| DM (tin nhắn trực tiếp) | ✅ |
| Kết bạn | ✅ |
| QuýBot (Groq AI) | ✅ |
| Bot modes: cold/romantic/evil/16+ | ✅ |
| Upload ảnh (GitHub hosting) | ✅ |
| File support (txt, pdf, png, jpg) | ✅ |
| Local chat cache | ✅ |
| Roles: admin/moderator/user | ✅ |
| Ban user | ✅ (via SQL) |
| Ghim tin nhắn | ✅ (via SQL) |
| Image lightbox | ✅ |
| Mobile responsive | ✅ |

---

## Lưu ý bảo mật

- **KHÔNG** commit `core.js` với API keys vào Git public
- Dùng **Vercel Environment Variables** cho production
- `SUPABASE_SERVICE_ROLE_KEY` chỉ dùng server-side (api/)
- Password trong signup_requests là base64 (tạm thời) — production nên dùng Edge Function + bcrypt
- RLS (Row Level Security) đã được bật cho tất cả tables

---

## Admin Operations (SQL)

```sql
-- Ban user
UPDATE profiles SET is_banned = true, ban_reason = 'Lý do' WHERE username = 'user123';

-- Promote to moderator
UPDATE profiles SET role = 'moderator' WHERE username = 'user123';

-- Xem signup requests đang chờ
SELECT * FROM signup_requests WHERE status = 'pending' ORDER BY created_at;

-- Xóa tin nhắn vi phạm
DELETE FROM messages WHERE id = 'message-uuid';
```

---

## QuýBot Modes

| Mode | Tính cách |
|------|-----------|
| ❄ Lạnh lùng | Ngắn gọn, sắc bén, ít cảm xúc |
| 🌹 Lãng mạn | Thơ mộng, ngọt ngào, đầy cảm xúc |
| 😈 Ác độc | Mỉa mai, châm biếm, drama |
| 🔥 16+ | Thoải mái chủ đề người lớn |

Bot lưu lịch sử hội thoại **trong RAM** (không lên DB) để tránh tốn storage.
