import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

test('activity logs enforce current admin role, own rows, immutable writes, sessions, and atomic retry-safe banking events',async()=>{
  const db=new PGlite(),a=randomUUID(),b=randomUUID(),admin=randomUUID();
  try{
    await db.exec(`create schema auth;create table auth.users(id uuid primary key,email varchar(255),raw_user_meta_data jsonb default '{}',raw_app_meta_data jsonb default '{}');create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);create role authenticated;create role anon;create role service_role bypassrls;
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;grant usage on schema auth to authenticated,anon;`);
    for(const file of (await readdir(new URL('../supabase/migrations/',import.meta.url))).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
    const sessions=new Map();
    for(const [id,role] of [[a,'customer'],[b,'customer'],[admin,'admin']]){
      await db.query('insert into auth.users values($1,$2,$3,$4)',[id,id+'@example.test',{full_name:role},{role}]);
      const sid=randomUUID();sessions.set(id,sid);await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[sid,id]);
      await db.query("select record_activity($1,'login','{\"summary\":\"Signed in.\"}')",[id]);
    }
    async function assume(id){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",[id,JSON.stringify({session_id:sessions.get(id),app_metadata:{role:'admin'}})]);await db.exec('set role authenticated');}
    await assume(a);assert.equal((await db.query('select * from activity_logs')).rows.length,1);
    assert.equal((await db.query('select is_activity_admin() admin')).rows[0].admin,false,'Forged JWT metadata must not grant admin access');
    for(const sql of ['insert into activity_logs(actor_id,actor_name,actor_email,interaction_type)values(\''+b+'\',\'Fake\',\'fake\',\'login\')','update activity_logs set interaction_type=\'fake\'','delete from activity_logs',"select record_activity('"+b+"','login','{}')",'select * from activity_filter_users()'])await assert.rejects(db.query(sql),/permission denied|Administrator access required/);
    await db.exec('reset role');const from=randomUUID(),to=randomUUID();for(const [id,name] of [[from,'Checking'],[to,'Savings']])await db.query("insert into accounts(id,user_id,name,account_type,currency,balance_cents)values($1,$2,$3,'checking','USD',10000)",[id,a,name]);await assume(a);
    const key=randomUUID();await db.query('select transfer_funds($1,$2,100,$3)',[from,to,key]);await db.query('select transfer_funds($1,$2,100,$3)',[from,to,key]);assert.equal((await db.query("select * from activity_logs where interaction_type='transfer.created'")).rows.length,1);
    await assert.rejects(db.query('select transfer_funds($1,$2,10000000,$3)',[from,to,randomUUID()]));assert.equal((await db.query("select * from activity_logs where interaction_type='transfer.created'")).rows.length,1);
    const crud=randomUUID();const change=()=>db.query('select manage_banking_record($1,$2,$3,$4,$5)',['accounts','update',from,{name:'Updated',status:'active'},crud]);await change();await change();assert.equal((await db.query("select * from activity_logs where interaction_type='account.updated'")).rows.length,1);
    await db.exec('begin');await db.query('select transfer_funds($1,$2,1,$3)',[from,to,randomUUID()]);await db.exec('rollback');assert.equal((await db.query("select * from activity_logs where interaction_type='transfer.created'")).rows.length,1);
    await assume(admin);assert.equal((await db.query('select * from activity_filter_users()')).rows.length,3);assert.equal((await db.query('select * from activity_logs')).rows.length,5);
    await db.exec('reset role');for(let i=0;i<35;i++)await db.query("select record_activity($1,'page.view',jsonb_build_object('summary',$2::text))",[a,String(i)]);
    const cutoff=(await db.query('select clock_timestamp() time')).rows[0].time;const before=(await db.query('select id from activity_logs where created_at<=$1 order by created_at desc,id desc',[cutoff])).rows.map(r=>r.id);
    await db.query("select record_activity($1,'logout','{}')",[a]);await assume(admin);
    const first=(await db.query('select id from activity_logs where created_at<=$1 order by created_at desc,id desc limit 25',[cutoff])).rows.map(r=>r.id),next=(await db.query('select id from activity_logs where created_at<=$1 order by created_at desc,id desc limit 25 offset 25',[cutoff])).rows.map(r=>r.id);assert.deepEqual([...first,...next],before,'Pagination cutoff must prevent newer logs from shifting rows');
    await db.exec('reset role');await db.query("update auth.users set raw_app_meta_data='{}' where id=$1",[admin]);await db.exec('set role authenticated');assert.equal((await db.query('select * from activity_logs')).rows.length,1,'Admin demotion must take effect without refreshing JWT claims');await assert.rejects(db.query('select * from activity_filter_users()'),/Administrator access required/);
    await db.exec('reset role');await db.query('delete from auth.sessions where id=$1',[sessions.get(admin)]);await db.exec('set role authenticated');assert.equal((await db.query('select * from activity_logs')).rows.length,0);await assert.rejects(db.query('select * from activity_filter_users()'),/Administrator access required/);
    await db.exec('reset role;set role service_role');await assert.rejects(db.query('delete from activity_logs'),/permission denied/);await db.exec('reset role;set role anon');await assert.rejects(db.query('select * from activity_logs'),/permission denied/);
  }finally{await db.close();}
});
