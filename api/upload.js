// api/upload.js — Vercel Serverless Function
// Proxy GitHub upload, giữ token server-side

export const config = { api: { bodyParser: { sizeLimit: '10mb' } } };

export default async function handler(req, res) {
    if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        return res.status(200).end();
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    // Verify Supabase JWT
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    try {
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
        const { data: { user }, error } = await supabase.auth.getUser(token);
        if (error || !user) return res.status(401).json({ error: 'Invalid token' });

        const { filename, base64, mimeType } = req.body;
        if (!filename || !base64) return res.status(400).json({ error: 'filename and base64 required' });

        // Validate file type
        const allowed = ['image/png', 'image/jpeg', 'text/plain', 'application/pdf'];
        if (!allowed.includes(mimeType)) return res.status(400).json({ error: 'File type not allowed' });

        const path = `uploads/${new Date().toISOString().slice(0, 7)}/${Date.now()}_${filename}`;
        const repo = process.env.GITHUB_REPO; // e.g. username/teamquytran-assets
        const branch = process.env.GITHUB_BRANCH || 'main';

        const githubRes = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${process.env.GITHUB_TOKEN}`,
                'Content-Type': 'application/json',
                'User-Agent': 'TeamQuyTran-App'
            },
            body: JSON.stringify({
                message: `Upload ${filename} by ${user.id}`,
                content: base64,
                branch
            })
        });

        if (!githubRes.ok) {
            const err = await githubRes.json();
            return res.status(502).json({ error: err.message || 'GitHub upload failed' });
        }

        const url = `https://raw.githubusercontent.com/${repo}/${branch}/${path}`;
        return res.status(200).json({ url });

    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
