import { NextResponse } from 'next/server';
import type { ZodType } from 'zod';

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export async function readJson<T>(request: Request, schema: ZodType<T>): Promise<T> {
  const origin = request.headers.get('origin');
  if (request.headers.get('sec-fetch-site') === 'cross-site' || (origin && origin !== new URL(request.url).origin)) throw new ApiError(403, 'Requests must originate from this application.');
  if (!request.headers.get('content-type')?.includes('application/json')) throw new ApiError(415, 'Send JSON with Content-Type: application/json.');
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, 'A JSON body is required.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 16_384) { await reader.cancel(); throw new ApiError(413, 'Request is too large.'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  let body: unknown;
  try { body = JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new ApiError(400, 'Send a valid JSON body.'); }
  const result = schema.safeParse(body);
  if (!result.success) throw new ApiError(400, result.error.issues[0].message);
  return result.data;
}
export function apiFailure(error: unknown, requestId = crypto.randomUUID()) {
  const known = error instanceof ApiError;
  if (!known) console.error('api_request_failed', { requestId });
  return NextResponse.json({ error: known ? error.message : 'The request could not be completed. Please try again.', requestId }, { status: known ? error.status : 500, headers: { 'Cache-Control': 'private, no-store', 'X-Request-Id': requestId } });
}
