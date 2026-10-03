import type { NextApiRequest, NextApiResponse } from 'next';
import fetch from 'node-fetch';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();
  const { prompt, sessionId } = req.body;
  if (!prompt || typeof prompt !== 'string') return res.status(400).json({ error: 'Missing prompt' });

  // Basic input sanitization
  if (prompt.length > 5000) return res.status(400).json({ error: 'Prompt too long' });

  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) return res.status(500).json({ error: 'OpenAI key not configured' });

  const payload = {
    model: 'gpt-4o-mini', // choose appropriate model
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 800
  };

  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openaiKey}` },
    body: JSON.stringify(payload)
  });

  if (!r.ok) {
    const err = await r.text();
    return res.status(500).json({ error: err });
  }
  const data = await r.json();
  res.status(200).json(data);
}
