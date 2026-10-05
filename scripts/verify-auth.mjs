import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServerClient } from '@supabase/ssr';

const baseUrl = process.env.AUTH_TEST_URL ?? 'http://localhost:3100';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_KEY;
const credentials = JSON.parse(await readFile(new URL('../.env.demo-users.json', import.meta.url), 'utf8'));
assert.ok(url && key, 'Supabase public configuration is required.');

async function session(role) {
  const credential = credentials.find(user => user.role === role);
  assert.ok(credential, `Seed a ${role} user first.`);
  const cookies = new Map();
  const client = createServerClient(url, key, {
    cookies: {
      getAll: () => [...cookies].map(([name, value]) => ({ name, value })),
      setAll: values => values.forEach(({ name, value }) => value ? cookies.set(name, value) : cookies.delete(name)),
    },
  });
  const { data, error } = await client.auth.signInWithPassword({ email: credential.email, password: credential.password });
  assert.ifError(error);
  assert.equal(data.user.app_metadata.role, role);
  const request = (pathname, options = {}) => fetch(new URL(pathname, baseUrl), { redirect: 'manual', ...options, headers: { Cookie: [...cookies].map(([name, value]) => `${name}=${value}`).join('; '), ...options.headers } });
  return { client, request };
}

for (const route of ['/dashboard', '/accounts', '/transactions', '/profile', '/admin/users']) {
  const response = await fetch(new URL(route, baseUrl), { redirect: 'manual' });
  assert.equal(response.status, 307, `Signed-out ${route}`);
  assert.equal(response.headers.get('location'), '/login');
}
for (const route of ['/api/accounts', '/api/transactions', '/api/transfer', '/api/openai/chat', '/api/openai/transfer']) {
  const response = await fetch(new URL(route, baseUrl), { method: ['/api/accounts', '/api/transactions'].includes(route) ? 'GET' : 'POST' });
  assert.equal(response.status, 401, `Signed-out ${route}`);
}
console.log('Signed-out page and API guards passed.');

const customer = await session('customer');
try {
  const dashboard = await customer.request('/dashboard');
  assert.equal(dashboard.status, 200);
  assert.ok(!(await dashboard.text()).includes('href="/admin/users"'), 'Customer navigation must hide Users.');
  const adminRoute = await customer.request('/admin/users');
  assert.equal(adminRoute.status, 307);
  assert.equal(adminRoute.headers.get('location'), '/dashboard');
  const transactions = await customer.request('/api/transactions');
  assert.equal(transactions.status, 200);
  const payload = await transactions.json();
  assert.ok(['demo', 'supabase'].includes(payload.source), 'Banking source must be explicit.');
  assert.ok(Array.isArray(payload.transactions));
  if (payload.source === 'demo') assert.equal(payload.transactions.length, 50);
  const accounts = await customer.request('/api/accounts');
  assert.equal(accounts.status, 200);
  assert.equal((await accounts.json()).source, payload.source);
  const transfer = await customer.request('/api/transfer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(transfer.status, payload.source === 'demo' ? 501 : 400, 'Unavailable or invalid transfers must not report success.');
  assert.equal((await transfer.json()).success, undefined);
  console.log('Customer navigation, admin denial, transaction access, and transfer failure passed.');
} finally { await customer.client.auth.signOut({ scope: 'local' }); }

const admin = await session('admin');
try {
  const directory = await admin.request('/admin/users');
  assert.equal(directory.status, 200);
  const html = await directory.text();
  assert.ok(html.includes('User directory') && html.includes('maya@adibank.example'));
  console.log('Administrator directory access passed.');
} finally { await admin.client.auth.signOut({ scope: 'local' }); }
