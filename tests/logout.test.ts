import { beforeEach, expect, test } from '@jest/globals';
declare const jest: typeof import('@jest/globals').jest;
jest.mock('server-only', () => ({}), { virtual: true });
jest.mock('next/navigation', () => ({ redirect: jest.fn() }));
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }));
jest.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: jest.fn() }));
jest.mock('@/lib/auth/session', () => ({ getCurrentUser: jest.fn() }));
jest.mock('@/lib/activity', () => ({ recordActivity: jest.fn(async () => true) }));
import { logout } from '@/app/auth/actions';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/session';
import { recordActivity } from '@/lib/activity';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

const signOut = jest.fn<(options: { scope: string }) => Promise<{ error: Error | null }>>();
beforeEach(() => {
  jest.clearAllMocks();
  signOut.mockResolvedValue({ error: null });
  jest.mocked(createSupabaseServerClient).mockResolvedValue({ auth: { signOut } } as unknown as Awaited<ReturnType<typeof createSupabaseServerClient>>);
  jest.mocked(getCurrentUser).mockResolvedValue({ id: 'customer' } as Awaited<ReturnType<typeof getCurrentUser>>);
});

test('ends the current session and returns success so the client can replace the document', async () => {
  expect(await logout()).toEqual({ success: true });
  expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
  expect(recordActivity).toHaveBeenCalledWith('customer', 'logout', { summary: 'Ended the current session.' });
  expect(redirect).not.toHaveBeenCalled();
  expect(revalidatePath).not.toHaveBeenCalled();
});

test('a rejected sign-out stays on the current page and does not record a successful logout', async () => {
  signOut.mockResolvedValue({ error: new Error('Unavailable') });
  expect(await logout()).toEqual({ error: 'Unable to end your session. Please try again.' });
  expect(recordActivity).not.toHaveBeenCalled();
});

test('a connection failure returns a recoverable error', async () => {
  signOut.mockRejectedValue(new Error('Connection unavailable'));
  expect(await logout()).toEqual({ error: 'Unable to end your session. Please try again.' });
});

test('an already expired session can still leave the authenticated UI', async () => {
  jest.mocked(getCurrentUser).mockResolvedValue(null);
  expect(await logout()).toEqual({ success: true });
  expect(recordActivity).not.toHaveBeenCalled();
});
