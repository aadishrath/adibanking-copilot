jest.mock('@/lib/activity',()=>({recordActivity:jest.fn(async()=>true)}));
import { beforeEach, expect, test } from '@jest/globals';
declare const jest: typeof import('@jest/globals').jest;
jest.mock('server-only', () => ({}), { virtual: true });
jest.mock('@/lib/auth/session', () => ({ getViewer: jest.fn() }));
jest.mock('@/lib/banking-revision', () => ({ readBankingRevision: jest.fn() }));
import { GET } from '@/app/api/banking/revision/route';
import { getViewer } from '@/lib/auth/session';
import { readBankingRevision } from '@/lib/banking-revision';
import { ApiError } from '@/lib/api/errors';

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(getViewer).mockResolvedValue({ id: 'owner', fullName: 'Owner', email: 'owner@example.test', role: 'customer' });
});
test('revision check denies signed-out users before touching the database', async () => {
  jest.mocked(getViewer).mockResolvedValue(null);
  expect((await GET()).status).toBe(401);
  expect(readBankingRevision).not.toHaveBeenCalled();
});
test('revision response contains only the owner token and cannot be cached publicly', async () => {
  jest.mocked(readBankingRevision).mockResolvedValue('b100f83a-3447-46bd-bb2e-391b9522fa64');
  const response = await GET();
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(await response.json()).toEqual({ revision: 'b100f83a-3447-46bd-bb2e-391b9522fa64' });
});
test('database outage has an actionable error instead of a fake unchanged token', async () => {
  jest.mocked(readBankingRevision).mockRejectedValue(new ApiError(503, 'Banking refresh is unavailable. Check the database revision migration.'));
  const response = await GET();
  expect(response.status).toBe(503);
  expect((await response.json()).error).toContain('revision migration');
});
