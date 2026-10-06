import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

test('banking revisions track atomic changes, isolate owners, reject writes and revoked sessions', async () => {
  const db = new PGlite(), uid = randomUUID(), other = randomUUID(), empty = randomUUID(), sid = randomUUID();
  try {
    await db.exec(`create schema auth; create table auth.users(id uuid primary key,email text); create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz); create role authenticated; create role anon; create role service_role bypassrls;
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
      grant usage on schema auth to authenticated,anon;`);
    for (const file of ['202610040001_banking.sql','202610040002_crud.sql','202610040003_analytics.sql','202610050001_account_types.sql','202610050002_credit_transfers.sql','202610050003_session_security.sql','202610050004_banking_revisions.sql']) await db.exec(await readFile(new URL('../supabase/migrations/' + file, import.meta.url), 'utf8'));
    for (const id of [uid, other, empty]) await db.query('insert into auth.users values($1,$2)', [id, id+'@example.test']);
    const from = randomUUID(), to = randomUUID(), otherAccount = randomUUID();
    for (const [id, owner, name] of [[from,uid,'Checking'],[to,uid,'Savings'],[otherAccount,other,'Other']]) await db.query("insert into accounts(id,user_id,name,account_type,currency,balance_cents) values($1,$2,$3,'checking','USD',10000)", [id,owner,name]);
    const otherRevision = (await db.query('select revision from banking_revisions where user_id=$1',[other])).rows[0].revision;
    await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[sid,uid]);
    await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",[uid,JSON.stringify({session_id:sid})]); await db.exec('set role authenticated');
    const revision = async () => (await db.query('select get_banking_revision() revision')).rows[0].revision;
    const first = await revision(); assert.match(first,/^[0-9a-f-]{36}$/); assert.equal(await revision(),first);
    assert.equal((await db.query('select * from banking_revisions')).rows.length,1);
    await assert.rejects(db.query('update banking_revisions set revision=gen_random_uuid()'),/permission denied/);
    const request = randomUUID();
    await db.query('select transfer_funds($1,$2,100,$3)',[from,to,request]); const afterTransfer = await revision(); assert.notEqual(afterTransfer,first);
    await db.query('select transfer_funds($1,$2,100,$3)',[from,to,request]); assert.equal(await revision(),afterTransfer,'An idempotent retry must not invalidate data');
    await assert.rejects(db.query('select transfer_funds($1,$2,10000000,$3)',[from,to,randomUUID()])); assert.equal(await revision(),afterTransfer,'Failed writes must not change the token');
    await db.exec('reset role; begin'); await db.query("update accounts set name='Rolled back' where id=$1",[from]); await db.exec('rollback; set role authenticated'); assert.equal(await revision(),afterTransfer);
    await db.exec('reset role');
    for (const [table, column, id] of [['accounts','name',from],['transactions','description',(await db.query('select id from transactions limit 1')).rows[0].id],['transfers','deleted_at',(await db.query('select id from transfers limit 1')).rows[0].id]]) {
      const before = (await db.query('select revision from banking_revisions where user_id=$1',[uid])).rows[0].revision;
      await db.query(`update ${table} set ${column}=${column} where id=$1`,[id]); assert.equal((await db.query('select revision from banking_revisions where user_id=$1',[uid])).rows[0].revision,before,'No-op updates should not rotate');
      await db.query(`update ${table} set ${column}=${table==='transfers'?'now()':"'Changed'"} where id=$1`,[id]); assert.notEqual((await db.query('select revision from banking_revisions where user_id=$1',[uid])).rows[0].revision,before);
    }
    const temp = randomUUID(); await db.query("insert into accounts(id,user_id,name,account_type,currency) values($1,$2,'Temporary','checking','USD')",[temp,uid]);
    const beforeDelete = (await db.query('select revision from banking_revisions where user_id=$1',[uid])).rows[0].revision;
    await db.query('delete from accounts where id=$1',[temp]); assert.notEqual((await db.query('select revision from banking_revisions where user_id=$1',[uid])).rows[0].revision,beforeDelete);
    assert.equal((await db.query('select revision from banking_revisions where user_id=$1',[other])).rows[0].revision,otherRevision,'Another user must not be invalidated');
    await db.query('update auth.sessions set user_id=$1 where id=$2',[empty,sid]); await db.query("select set_config('request.jwt.claim.sub',$1,false)",[empty]); await db.exec('set role authenticated'); assert.equal(await revision(),'00000000-0000-0000-0000-000000000000');
    await db.exec('reset role'); await db.query('delete from auth.sessions where id=$1',[sid]); await db.exec('set role authenticated'); await assert.rejects(revision(),/Session expired or revoked/); assert.equal((await db.query('select * from banking_revisions')).rows.length,0);
    await db.exec('reset role; set role anon'); await assert.rejects(revision(),/permission denied/); await assert.rejects(db.query('select * from banking_revisions'),/permission denied/);
    await db.exec('reset role'); await db.query('delete from auth.users where id=$1',[other]); assert.equal((await db.query('select * from banking_revisions where user_id=$1',[other])).rows.length,0,'User cascade must remove revision safely');
  } finally { await db.close(); }
});
