import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const migration = await readFile(new URL('../supabase/migrations/202610060002_lock_legacy_users.sql', import.meta.url), 'utf8');
test('legacy users data is preserved while anonymous and authenticated API access is revoked', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated;
      create table public.users(id integer primary key, name text);
      insert into public.users values(1,'Sample user');
      grant all on public.users to public,anon,authenticated;`);
    await db.exec(migration);
    await db.exec(migration);
    assert.equal((await db.query("select relrowsecurity from pg_class where oid='public.users'::regclass")).rows[0].relrowsecurity, true);
    for (const role of ['anon','authenticated']) {
      await db.exec('set role ' + role);
      for (const query of ['select * from public.users', "insert into public.users values(2,'Invalid')", "update public.users set name='Invalid'", 'delete from public.users', 'truncate public.users']) {
        await assert.rejects(db.query(query), /permission denied/);
      }
      await db.exec('reset role');
    }
    assert.deepEqual((await db.query('select * from public.users')).rows, [{ id: 1, name: 'Sample user' }]);
  } finally { await db.close(); }
});
test('lockdown migration works when a new project has no legacy users table', async () => {
  const db = new PGlite();
  try { await db.exec('create role anon; create role authenticated;'); await db.exec(migration); }
  finally { await db.close(); }
});
