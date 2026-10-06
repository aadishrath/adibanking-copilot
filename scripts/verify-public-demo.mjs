import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServerClient } from '@supabase/ssr';

const base = process.env.DEMO_TEST_URL ?? 'https://adibanking-copilot.vercel.app';
const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
const accounts = JSON.parse(config.env.DEMO_LOGIN_ACCOUNTS);
const clients = [];
try {
  const login = await fetch(base + '/login', { signal: AbortSignal.timeout(30000) });
  assert.equal(login.status, 200);
  const html = await login.text();
  for (const account of accounts) assert.ok(html.includes(account.email), 'Public selector is missing a demo identity.');
  for (const account of accounts) {
    const cookies = new Map();
    const client = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_KEY, {
      cookies: { getAll: () => [...cookies].map(([name, value]) => ({ name, value })), setAll: values => values.forEach(({ name, value }) => value ? cookies.set(name, value) : cookies.delete(name)) },
    });
    clients.push(client);
    const signedIn = await client.auth.signInWithPassword({ email: account.email, password: account.password });
    assert.ok(!signedIn.error, 'Public demo credentials are invalid.');
    assert.equal(signedIn.data.user.app_metadata.role, account.role);
    const request = (path, body) => fetch(base + path, {
      method: body ? 'POST' : 'GET', signal: AbortSignal.timeout(30000),
      headers: { Cookie: [...cookies].map(([name, value]) => `${name}=${value}`).join('; '), ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const banking = await request('/api/banking');
    assert.equal(banking.status, 200, 'Live banking read failed.');
    const snapshot = await banking.json();
    assert.equal(snapshot.source, 'supabase');
    assert.ok(snapshot.accounts.length >= 7);
    const event = await request('/api/logs', { type: 'page.view', path: '/dashboard' });
    assert.equal(event.status, 200, 'Live activity logging requires valid server configuration.');
    const from = snapshot.accounts.find(row => row.accountType === 'checking');
    const to = snapshot.accounts.find(row => row.accountType === 'savings' && row.currency === from.currency);
    const preview = await request('/api/assistant/chat', { prompt: `transfer 0.01 from ${from.id} to ${to.id}`, timezone: 'America/Los_Angeles', currency: from.currency });
    assert.equal(preview.status, 200, 'Assistant preview failed.');
    const proposed = await preview.json();
    assert.equal(proposed.proposal?.amountCents, 1, 'Assistant transfer previews require a configured signing secret.');
    if (account.role === 'admin') {
      const directory = await request('/admin/users');
      assert.equal(directory.status, 200);
      assert.ok((await directory.text()).includes('maya@adibank.example'), 'Live admin directory requires a valid service-role key.');
    }
    console.log(`Public ${account.role} demo: sign-in, seeded banking, activity logging, and unconfirmed assistant preview passed.`);
  }
  console.log('All three public demo identities passed. No transfer was confirmed or balance changed.');
} catch (error) {
  console.error(error instanceof assert.AssertionError ? error.message : 'Public demo verification failed; credentials and confirmation tokens were not logged.');
  process.exitCode = 1;
} finally { for (const client of clients) await client.auth.signOut({ scope: 'local' }); }
