import { describe, test, expect } from '@jest/globals';
import { z } from 'zod';
import { readJson, apiFailure, ApiError } from '@/lib/api/errors';
const schema = z.object({ amount: z.number().int().positive() }).strict();
const request = (body: string, contentType = 'application/json') => new Request('https://example.com', { method: 'POST', headers: { 'Content-Type': contentType }, body });
describe('API boundary', () => {
  test('validates content type, JSON, shape and actual body size', async () => {
    await expect(readJson(request('{}', 'text/plain'), schema)).rejects.toMatchObject({ status: 415 });
    await expect(readJson(request('{bad'), schema)).rejects.toMatchObject({ status: 400 });
    await expect(readJson(request('{"amount":-1}'), schema)).rejects.toMatchObject({ status: 400 });
    await expect(readJson(request('x'.repeat(20_000)), schema)).rejects.toMatchObject({ status: 413 });
    await expect(readJson(request('{"amount":100}'), schema)).resolves.toEqual({ amount: 100 });
  });
  test('returns client-safe errors with request correlation', async () => {
    const response = apiFailure(new ApiError(503, 'Service unavailable'), 'test-request');
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'Service unavailable', requestId: 'test-request' });
    expect(response.headers.get('Cache-Control')).toContain('no-store');
  });
});
