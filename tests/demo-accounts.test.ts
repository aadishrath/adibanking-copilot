import { afterEach, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';
declare const jest: typeof import('@jest/globals').jest;
jest.mock('server-only', () => ({}), { virtual: true });
import { getDemoAccounts } from '@/lib/auth/demo-accounts';

const originalEnabled = process.env.DEMO_LOGIN_ENABLED;
const originalAccounts = process.env.DEMO_LOGIN_ACCOUNTS;
afterEach(() => {
  if (originalEnabled === undefined) delete process.env.DEMO_LOGIN_ENABLED;
  else process.env.DEMO_LOGIN_ENABLED = originalEnabled;
  if (originalAccounts === undefined) delete process.env.DEMO_LOGIN_ACCOUNTS;
  else process.env.DEMO_LOGIN_ACCOUNTS = originalAccounts;
});

test('Vercel supplies all three public identities without the ignored local credentials file', async () => {
  const config = JSON.parse(readFileSync('vercel.json', 'utf8'));
  expect(Object.keys(config.env).sort()).toEqual(['BANKING_DATA_SOURCE', 'DEMO_LOGIN_ACCOUNTS', 'DEMO_LOGIN_ENABLED']);
  expect(config.env.BANKING_DATA_SOURCE).toBe('supabase');
  Object.assign(process.env, config.env);
  const accounts = await getDemoAccounts();
  expect(accounts.map(account => [account.email, account.role])).toEqual([
    ['admin@adibank.example', 'admin'], ['maya@adibank.example', 'customer'], ['alex@adibank.example', 'customer'],
  ]);
  expect(accounts.every(account => account.password.length === 8)).toBe(true);
});

test('only allowlisted identities with matching roles are published', async () => {
  process.env.DEMO_LOGIN_ENABLED = 'true';
  process.env.DEMO_LOGIN_ACCOUNTS = JSON.stringify([
    { email: 'private@example.com', role: 'admin', password: 'Private!' },
    { email: 'maya@adibank.example', role: 'admin', password: 'Invalid!' },
    { email: 'alex@adibank.example', role: 'customer', password: 'Sample12' },
  ]);
  expect((await getDemoAccounts()).map(account => account.email)).toEqual(['alex@adibank.example']);
});

test('an explicitly disabled demo publishes no credentials', async () => {
  process.env.DEMO_LOGIN_ENABLED = 'false';
  expect(await getDemoAccounts()).toEqual([]);
});

test('invalid deployment JSON fails closed', async () => {
  process.env.DEMO_LOGIN_ENABLED = 'true';
  process.env.DEMO_LOGIN_ACCOUNTS = 'invalid';
  expect(await getDemoAccounts()).toEqual([]);
});
