// api/chat.js — QuyTranChat Groq proxy with model selection
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { prompt, messages, hasImages, model } = req.body;
  if (!prompt || !messages) return res.status(400).json({ error: 'Thiếu prompt hoặc messages' });

  const GROQ_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_KEY) return res.status(500).json({ error: 'Chưa cấu hình GROQ_API_KEY' });

  // Model selection: use requested model, fallback to vision model if has images
  const VISION_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';
  const DEFAULT_MODEL = 'llama-3.3-70b-versatile';
  const selectedModel = model || (hasImages ? VISION_MODEL : DEFAULT_MODEL);

  try {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: selectedModel,
        messages: [
          { role: 'system', content: prompt },
          ...messages.slice(-14)
        ],
        max_tokens: 1500,
        temperature: 0.85,
      })
    });

    if (!r.ok) {
      const err = await r.json();
      return res.status(r.status).json({ error: err?.error?.message || 'Groq error' });
    }

    const data = await r.json();
    const reply = data.choices?.[0]?.message?.content || '';
    return res.status(200).json({ reply, model: selectedModel });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
