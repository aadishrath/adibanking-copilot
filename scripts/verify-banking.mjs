import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';

// Read-only: this command never creates accounts or moves funds.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_KEY;
const schemaColumns = {
  accounts: 'id,user_id,name,account_type,currency,balance_cents,status,created_at',
  transactions: 'id,user_id,account_id,transfer_id,amount_cents,currency,description,category,created_at',
  transfers: 'id,user_id,from_account_id,to_account_id,amount_cents,currency,idempotency_key,created_at',
};

async function main() {
  assert.ok(url && publicKey && process.env.SUPABASE_SERVICE_ROLE_KEY, 'Configure Supabase public and service-role keys in .env.local.');
  const service = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  let ready = true;
  for (const [table, columns] of Object.entries(schemaColumns)) {
    const { error } = await service.from(table).select(columns).limit(0);
    if (error) {
      ready = false;
      console.error(`${table}: schema unavailable or incompatible (${error.code ?? 'connection failure'}).`);
    } else console.log(`${table}: expected columns available.`);
  }
  // Inspect function metadata rather than invoking a financial mutation.
  const metadataResponse = await fetch(new URL('/rest/v1/', url), {
    headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, Accept: 'application/openapi+json' },
    signal: AbortSignal.timeout(15_000),
  });
  assert.ok(metadataResponse.ok, 'Could not inspect the hosted API schema.');
  const metadata = await metadataResponse.json();
  if (!metadata.paths?.['/rpc/transfer_funds']) {
    ready = false;
    console.error('transfer_funds: function is not exposed.');
  }
  assert.ok(ready, 'Apply the banking migration and seed before enabling persistent mode. See docs/BANKING_DATA_SETUP.md.');

  const credentials = JSON.parse(await readFile(new URL('../.env.demo-users.json', import.meta.url), 'utf8'));
  const customers = credentials.filter(user => user.role === 'customer').slice(0, 2);
  assert.equal(customers.length, 2, 'Seed two customer users before checking isolation.');
  const sessions = [];
  try {
    for (const credential of customers) {
      const cookies = new Map();
      const client = createServerClient(url, publicKey, {
        cookies: {
          getAll: () => [...cookies].map(([name, value]) => ({ name, value })),
          setAll: values => values.forEach(({ name, value }) => value ? cookies.set(name, value) : cookies.delete(name)),
        },
      });
      sessions.push({ client, cookies });
      const { data, error } = await client.auth.signInWithPassword({ email: credential.email, password: credential.password });
      assert.ok(!error && data.user, 'Customer sign-in failed. Check the locally stored demo credentials.');
      sessions.at(-1).id = data.user.id;
    }
    const accountSets = [];
    for (const session of sessions) {
      for (const [table, columns] of Object.entries(schemaColumns)) {
        // No owner filter: RLS itself must perform the isolation.
        const { data, error } = await session.client.from(table).select(columns);
        assert.ok(!error, `${table}: authenticated read failed.`);
        assert.ok(data.every(row => row.user_id === session.id), `${table}: another user's data is visible.`);
        if (table === 'accounts') {
          assert.ok(data.length >= 2, 'Seed the customer checking/savings accounts first.');
          assert.ok(data.every(row => Number.isSafeInteger(row.balance_cents) && row.balance_cents >= 0), 'Balances must be nonnegative safe integer cents.');
          accountSets.push(data);
        }
      }
      const other = sessions.find(item => item.id !== session.id);
      for (const table of Object.keys(schemaColumns)) {
        const { data, error } = await session.client.from(table).select('id').eq('user_id', other.id);
        assert.ok(!error && data.length === 0, `${table}: another owner is accessible by a direct filter.`);
      }
      if (process.argv.includes('--app')) {
        const baseUrl = process.env.BANKING_TEST_URL ?? process.env.AUTH_TEST_URL ?? 'http://localhost:3100';
        for (const table of ['accounts', 'transactions']) {
          const response = await fetch(new URL(`/api/${table}`, baseUrl), {
            headers: { Cookie: [...session.cookies].map(([name, value]) => `${name}=${value}`).join('; ') },
            signal: AbortSignal.timeout(30_000),
          });
          assert.equal(response.status, 200, `${table}: app API failed.`);
          const payload = await response.json();
          assert.equal(payload.source, 'supabase', 'The running application still uses demo mode. Restart with BANKING_DATA_SOURCE=supabase.');
          const ownIds = new Set(accountSets.at(-1).map(row => row.id));
          assert.ok(payload[table].every(row => ownIds.has(table === 'accounts' ? row.id : row.accountId)), `${table}: app returned unexpected account data.`);
        }
      }
    }
    assert.ok(accountSets[0].every(row => !accountSets[1].some(other => other.id === row.id)), 'Customer account sets must be disjoint.');
    const anonymous = createClient(url, publicKey, { auth: { persistSession: false, autoRefreshToken: false } });
    for (const table of Object.keys(schemaColumns)) {
      const { data, error } = await anonymous.from(table).select('id');
      assert.ok(error || data.length === 0, `${table}: anonymous data exposure.`);
    }
    console.log('Hosted schema, two-customer read isolation, and anonymous access checks passed.');
    console.log('No balances changed. Write permissions, transfer concurrency, and browser flows still need verification.');
  } finally {
    const results = await Promise.allSettled(sessions.map(({ client }) => client.auth.signOut({ scope: 'local' })));
    for (const result of results) {
      if (result.status === 'rejected' || result.value.error) console.error('A verification session could not be signed out.');
    }
  }
}

main().catch(error => {
  // Never print provider payloads or cookie/credential-bearing request objects.
  console.error(error instanceof assert.AssertionError ? error.message : 'Banking verification failed. Check connection/configuration and retry.');
  process.exitCode = 1;
});
