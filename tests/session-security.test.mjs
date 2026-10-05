import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
test('active-session policies deny revoked/expired/mismatched JWTs and RPC retries',async()=>{
 const db=new PGlite(),uid='00000000-0000-0000-0000-000000000001',sid=randomUUID();
 try{
 await db.exec(`create schema auth;create table auth.users(id uuid primary key,email text);create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);create role authenticated;create role anon;create role service_role bypassrls;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;grant usage on schema auth to authenticated,anon;insert into auth.users values ('${uid}','maya@adibank.example');`);
 for(const f of ['202610040001_banking.sql','202610040002_crud.sql','202610040003_analytics.sql','202610050001_account_types.sql','202610050002_credit_transfers.sql','202610050003_session_security.sql'])await db.exec(await readFile(new URL('../supabase/migrations/'+f,import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../supabase/seed.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../supabase/demo-credit-activity.sql',import.meta.url),'utf8'));
 await db.query('insert into auth.sessions(id,user_id)values($1,$2)',[sid,uid]);
 await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",[uid,JSON.stringify({session_id:sid})]);await db.exec('set role authenticated');
 assert.equal((await db.query('select has_active_banking_session() ok')).rows[0].ok,true);
 const accounts=(await db.query('select * from accounts')).rows;assert.equal(accounts.length,7);
 const from=accounts.find(a=>a.account_type==='checking').id,to=accounts.find(a=>a.account_type==='savings').id,key=randomUUID();
 const transfer=()=>db.query('select transfer_funds($1,$2,1,$3)',[from,to,key]);await transfer();
 await db.exec('reset role');await db.query('delete from auth.sessions where id=$1',[sid]);await db.exec('set role authenticated');
 for(const table of ['accounts','transactions','transfers','banking_changes'])assert.equal((await db.query('select * from '+table)).rows.length,0);
 await assert.rejects(transfer(),/Session expired or revoked/);
 await assert.rejects(db.query('select manage_banking_record($1,$2,$3,$4,$5)',['accounts','create',randomUUID(),{name:'Invalid',account_type:'checking',currency:'USD'},randomUUID()]),/Session expired or revoked/);
 await db.exec('reset role');await db.query("insert into auth.sessions values($1,$2,now()-interval '1 minute')",[sid,uid]);await db.exec('set role authenticated');assert.equal((await db.query('select has_active_banking_session() ok')).rows[0].ok,false);
 await db.exec('reset role');await db.query('update auth.sessions set not_after=null,user_id=$1 where id=$2',[randomUUID(),sid]);await db.exec('set role authenticated');assert.equal((await db.query('select has_active_banking_session() ok')).rows[0].ok,false);
 await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({session_id:'malformed'})]);assert.equal((await db.query('select has_active_banking_session() ok')).rows[0].ok,false);
 await db.exec('reset role;set role anon');await assert.rejects(db.query('select has_active_banking_session()'),/permission denied/);
 }finally{await db.close();}
});
