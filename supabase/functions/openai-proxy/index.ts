// // supabase/functions/openai-proxy/index.ts
// import { serve } from 'std/server';

// serve(async (req) => {
//   const { prompt } = await req.json();
//   const OPENAI_KEY = Deno.env.get('OPENAI_API_KEY'); // set via Supabase secrets
//   // validate prompt length, sanitize input
//   const r = await fetch('https://api.openai.com/v1/chat/completions', {
//     method: 'POST',
//     headers: { 'Authorization': `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
//     body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }] })
//   });
//   const data = await r.json();
//   return new Response(JSON.stringify(data), { status: 200 });
// });


// const corsHeaders = {
//   'Access-Control-Allow-Origin': '*',
//   'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
//   'Access-Control-Allow-Methods': 'POST, OPTIONS',
// };

// function jsonResponse(body: unknown, status: number) {
//   return new Response(JSON.stringify(body), {
//     status,
//     headers: { ...corsHeaders, 'Content-Type': 'application/json' },
//   });
// }

// Deno.serve(async (req: Request) => {
//   if (req.method === 'OPTIONS') {
//     return new Response('ok', { headers: corsHeaders });
//   }

//   if (req.method !== 'POST') {
//     return jsonResponse({ error: 'Method not allowed' }, 405);
//   }

//   const contentType = req.headers.get('content-type') ?? '';
//   if (!contentType.toLowerCase().includes('application/json')) {
//     return jsonResponse({ error: 'Content-Type must be application/json' }, 415);
//   }

//   const contentLength = Number(req.headers.get('content-length') ?? '0');
//   if (contentLength > 16_384) {
//     return jsonResponse({ error: 'Request body is too large' }, 413);
//   }

//   let body: unknown;
//   try {
//     body = await req.json();
//   } catch {
//     return jsonResponse({ error: 'Invalid JSON body' }, 400);
//   }

//   const prompt = (body as { prompt?: unknown } | null)?.prompt;
//   if (typeof prompt !== 'string' || prompt.trim().length === 0) {
//     return jsonResponse({ error: 'prompt must be a non-empty string' }, 400);
//   }
//   if (prompt.length > 8_000) {
//     return jsonResponse({ error: 'prompt must be at most 8000 characters' }, 413);
//   }

//   const openAiKey = Deno.env.get('OPENAI_API_KEY');
//   if (!openAiKey) {
//     console.error('OPENAI_API_KEY secret is not configured');
//     return jsonResponse({ error: 'Service is not configured' }, 500);
//   }

//   try {
//     const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
//       method: 'POST',
//       headers: {
//         Authorization: `Bearer ${openAiKey}`,
//         'Content-Type': 'application/json',
//       },
//       body: JSON.stringify({
//         model: 'gpt-4o-mini',
//         messages: [{ role: 'user', content: prompt.trim() }],
//       }),
//       signal: AbortSignal.timeout(30_000),
//     });

//     const responseBody = await upstream.text();
//     return new Response(responseBody, {
//       status: upstream.status,
//       headers: {
//         ...corsHeaders,
//         'Content-Type': upstream.headers.get('content-type') ?? 'application/json',
//       },
//     });
//   } catch (error) {
//     console.error('OpenAI request failed:', error instanceof Error ? error.message : 'Unknown error');
//     return jsonResponse({ error: 'Unable to reach the AI provider' }, 502);
//   }
// });