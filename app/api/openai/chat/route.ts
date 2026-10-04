import { NextRequest, NextResponse } from 'next/server';

type Body = { prompt?: string; sessionId?: string };

const MAX_PROMPT_LENGTH = 4000;
const RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 20;
const ipMap = new Map<string, { count: number; resetAt: number }>();

function extractClientIp(req: NextRequest) {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();

  const realIp = req.headers.get('x-real-ip');
  if (realIp) return realIp;

  const cfIp = req.headers.get('cf-connecting-ip');
  if (cfIp) return cfIp;

  return req.headers.get('x-client-ip') ?? 'unknown';
}

function rateLimit(ip: string) {
  const now = Date.now();
  const entry = ipMap.get(ip);
  if (!entry || now > entry.resetAt) {
    ipMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { ok: true, remaining: MAX_REQUESTS_PER_WINDOW - 1 };
  }
  if (entry.count >= MAX_REQUESTS_PER_WINDOW) {
    return { ok: false, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
  }
  entry.count += 1;
  ipMap.set(ip, entry);
  return { ok: true, remaining: MAX_REQUESTS_PER_WINDOW - entry.count };
}

export async function POST(req: NextRequest) {
  try {
    const ip = extractClientIp(req);
    const rl = rateLimit(ip);
    if (!rl.ok) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Try again later.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfter ?? 60) } }
      );
    }

    const body = (await req.json()) as Body;
    const prompt = (body?.prompt ?? '').toString().trim();
    if (!prompt) return NextResponse.json({ error: 'Missing prompt' }, { status: 400 });
    if (prompt.length > MAX_PROMPT_LENGTH) {
      return NextResponse.json({ error: 'Prompt too long' }, { status: 400 });
    }

    const OPENAI_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_KEY) {
      return NextResponse.json({ error: 'OpenAI key not configured' }, { status: 500 });
    }

    const sanitized = prompt.replace(/[\x00-\x1F\x7F]/g, ' ').slice(0, MAX_PROMPT_LENGTH);

    const payload = {
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: sanitized }],
      max_tokens: 800,
      temperature: 0.2,
    };

    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    if (!r.ok) {
      const text = await r.text();
      return NextResponse.json({ error: 'OpenAI error', details: text }, { status: 502 });
    }

    const data = await r.json();
    const assistant = data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.text ?? '';

    return NextResponse.json({ assistant, raw: data });
  } catch (err) {
    return NextResponse.json({ error: 'Server error', details: String(err) }, { status: 500 });
  }
}
