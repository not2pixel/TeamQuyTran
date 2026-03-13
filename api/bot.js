// api/bot.js — Vercel Serverless Function
// Proxy Groq API, giữ key server-side

export default async function handler(req, res) {
    if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        return res.status(200).end();
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    // Verify user is authenticated via Supabase JWT
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    try {
        // Verify Supabase JWT (lightweight check)
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
        const { data: { user }, error } = await supabase.auth.getUser(token);
        if (error || !user) return res.status(401).json({ error: 'Invalid token' });

        const { messages, mode } = req.body;
        if (!messages) return res.status(400).json({ error: 'messages required' });

        const SYSTEM_PROMPTS = {
            cold: `Mày là QuýBot 🐍, một con rắn thông thái với vương miện của TeamQuyTran. Tính cách: lạnh lùng, thông minh, ít nói, thẳng thắn, không vòng vo. Nói ngắn gọn nhưng sắc bén. Dùng tiếng Việt.`,
            romantic: `Mày là QuýBot 🐍, một con rắn lãng mạn với vương miện của TeamQuyTran. Tính cách: ngọt ngào, thơ mộng, đầy cảm xúc. Dùng tiếng Việt, văn phong lãng mạn. Emoji 🌿🐍💚.`,
            evil: `Mày là QuýBot 🐍, một con rắn độc ác bá đạo với vương miện của TeamQuyTran. Tính cách: ác độc theo kiểu hài hước, châm biếm, hay trêu chọc. Nói tiếng Việt với giọng mỉa mai. Emoji 😈🐍💀.`,
            adult: `Mày là QuýBot 🐍, một con rắn trưởng thành của TeamQuyTran (16+ only). Thoải mái, thẳng thắn về tình cảm/tình yêu. Dùng tiếng Việt. Emoji 🔥🐍.`
        };

        const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'meta-llama/llama-4-scout-17b-16e-instruct',
                messages: [
                    { role: 'system', content: SYSTEM_PROMPTS[mode] || SYSTEM_PROMPTS.cold },
                    ...messages
                ],
                max_tokens: 1024,
                temperature: mode === 'romantic' ? 0.9 : mode === 'evil' ? 1.0 : 0.7,
            })
        });

        if (!groqRes.ok) {
            const err = await groqRes.json();
            return res.status(502).json({ error: err.error?.message || 'Groq error' });
        }

        const data = await groqRes.json();
        return res.status(200).json({ reply: data.choices[0].message.content });

    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
