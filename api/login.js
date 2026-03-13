// api/login.js — Vercel Serverless Function
// Xác thực code login, trả về profile

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'Thiếu code' });

  try {
    const { createClient } = await import('@supabase/supabase-js');
    const db = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY  // service role key — full access, không bị RLS
    );

    // Tìm code
    const { data: codeRow, error: e1 } = await db
      .from('auth_codes')
      .select('id, user_id')
      .eq('code', code.toUpperCase().trim())
      .maybeSingle();

    if (e1 || !codeRow) return res.status(401).json({ error: 'Mã không đúng hoặc không tồn tại.' });

    // Lấy profile
    const { data: profile, error: e2 } = await db
      .from('profiles')
      .select('*')
      .eq('id', codeRow.user_id)
      .single();

    if (e2 || !profile) return res.status(401).json({ error: 'Tài khoản không tồn tại. Liên hệ admin.' });
    if (profile.is_banned) return res.status(403).json({ error: `Tài khoản bị khóa: ${profile.ban_reason || 'Vi phạm quy tắc.'}` });

    return res.status(200).json({ profile });

  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Lỗi server: ' + e.message });
  }
}
