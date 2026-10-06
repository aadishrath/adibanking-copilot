import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createServerClient } from '@supabase/ssr';

const base = process.env.SECURITY_TEST_URL ?? 'http://localhost:3100';
const users = JSON.parse(await readFile(new URL('../.env.demo-users.json', import.meta.url), 'utf8')).filter(u => u.role === 'customer').slice(0, 2);
const sessions = [];
async function request(path, session, body) {
  const response = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: { Cookie: session.cookie, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30000) });
  assert.equal(response.status, 200, path + ' must succeed');
  assert.match(response.headers.get('cache-control'), /private, no-store/);
  return { data: await response.json(), headers: response.headers };
}
try {
  for (const user of users) {
    const cookies = new Map();
    const client = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_KEY, { cookies: { getAll: () => [...cookies].map(([name,value]) => ({name,value})), setAll: values => values.forEach(({name,value}) => value ? cookies.set(name,value) : cookies.delete(name)) } });
    assert.ok(!(await client.auth.signInWithPassword({email:user.email,password:user.password})).error, 'Demo sign-in must succeed');
    sessions.push({ client, cookie: [...cookies].map(([k,v]) => k+'='+v).join('; ') });
  }
  const [a,b] = sessions; assert.ok(a && b);
  const token = async session => (await request('/api/banking/revision',session)).data.revision;
  const initial = await token(a), other = await token(b);
  const snapshot = (await request('/api/banking',a)).data;
  assert.equal(snapshot.revision, initial); assert.equal(await token(a), initial);
  const analytics = await request('/api/analytics',a); assert.equal(analytics.headers.get('x-banking-revision'), initial);
  const account = snapshot.accounts[0], requestId = randomUUID();
  const update = { kind:'accounts', operation:'update', id:account.id, requestId, values:{name:account.name+' refresh check',status:account.status} };
  try {
    const changed = (await request('/api/banking/manage',a,update)).data;
    assert.notEqual(changed.revision, initial); assert.equal(await token(a), changed.revision);
    const retry = (await request('/api/banking/manage',a,update)).data; assert.equal(retry.revision, changed.revision);
    assert.equal(await token(b), other, 'Another customer must retain their token');
    assert.ok(changed.accounts.some(row => row.name===update.values.name));
  } finally {
    await request('/api/banking/manage',a,{...update,requestId:randomUUID(),values:{name:account.name,status:account.status}});
  }
  const restored = (await request('/api/banking',a)).data;
  for (const account of snapshot.accounts) assert.equal(restored.accounts.find(row => row.id===account.id).balanceCents,account.balanceCents);
  console.log('Hosted revision/snapshot/analytics tokens, unchanged reads, CRUD changes, idempotent retries and customer isolation passed. Original name and all balances restored.');
} finally { for (const session of sessions) await session.client.auth.signOut({scope:'local'}); }
