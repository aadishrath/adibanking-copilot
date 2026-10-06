import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServerClient } from '@supabase/ssr';
import { randomUUID } from 'node:crypto';
const base=process.env.SECURITY_TEST_URL??'http://localhost:3100',sessions=[];
const users=JSON.parse(await readFile(new URL('../.env.demo-users.json',import.meta.url),'utf8'));
async function request(session,path,body){const response=await fetch(base+path,{method:body?'POST':'GET',headers:{Cookie:session.cookie,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});assert.match(response.headers.get('cache-control')??'',/private, no-store/);return {status:response.status,data:await response.json()};}
try{
  for(const user of users){const cookies=new Map();const client=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY??process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY??process.env.NEXT_PUBLIC_SUPABASE_KEY,{cookies:{getAll:()=>[...cookies].map(([name,value])=>({name,value})),setAll:values=>values.forEach(({name,value})=>value?cookies.set(name,value):cookies.delete(name))}});const {data,error}=await client.auth.signInWithPassword({email:user.email,password:user.password});assert.ok(!error);sessions.push({client,id:data.user.id,role:user.role,cookie:[...cookies].map(([k,v])=>k+'='+v).join('; ')});}
  const admin=sessions.find(s=>s.role==='admin'),[a,b]=sessions.filter(s=>s.role==='customer');assert.ok(admin&&a&&b);
  for(const session of sessions)assert.equal((await request(session,'/api/logs',{type:'page.view',path:'/logs'})).status,200);
  for(const session of [a,b]){const result=await request(session,'/api/logs');assert.equal(result.status,200);assert.ok(result.data.rows.every(r=>r.actor_id===session.id));assert.equal(result.data.users.length,0);assert.equal((await request(session,'/api/logs?userId='+admin.id)).status,403);const direct=await session.client.from('activity_logs').select('actor_id');assert.ok(!direct.error);assert.ok(direct.data.every(row=>row.actor_id===session.id));assert.ok((await session.client.rpc('activity_filter_users')).error);assert.ok((await session.client.rpc('record_activity',{p_actor:admin.id,p_type:'login',p_details:{}})).error);}
  const all=await request(admin,'/api/logs');assert.equal(all.status,200);assert.ok(all.data.users.length>=3);
  for(const session of [a,b]){const own=await request(admin,'/api/logs?userId='+session.id);assert.ok(own.data.rows.length>0&&own.data.rows.every(row=>row.actor_id===session.id));}
  assert.equal((await request(a,'/api/logs',{type:'login',path:'/logs'})).status,400);assert.equal((await request(a,'/api/logs',{type:'ui.click',path:'/logs',actorId:admin.id})).status,400);
  for(let i=0;i<26;i++)assert.equal((await request(a,'/api/logs',{type:'ui.click',path:'/logs',label:'Pagination verification'})).status,200);
  const one=await request(a,'/api/logs?type=ui.click');assert.equal(one.data.rows.length,25);assert.ok(one.data.rows.every(row=>row.interaction_type.includes('ui.click')));
  await request(a,'/api/logs',{type:'ui.click',path:'/logs',label:'Newer interaction'});
  const two=await request(a,'/api/logs?type=ui.click&page=2&asOf='+encodeURIComponent(one.data.asOf));assert.equal(two.data.total,one.data.total);assert.ok(two.data.rows.every(row=>!one.data.rows.some(first=>first.id===row.id)));
  const noMatch=await request(a,'/api/logs?type=Pagination%20verification');assert.equal(noMatch.data.total,0,'Search must not search details');
  const snapshot=(await request(a,'/api/banking')).data,account=snapshot.accounts[0],requestId=randomUUID();
  const change={kind:'accounts',operation:'update',id:account.id,requestId,values:{name:account.name+' log check',status:account.status}};
  try{
    assert.equal((await request(a,'/api/banking/manage',change)).status,200);assert.equal((await request(a,'/api/banking/manage',change)).status,200);
    const audit=await request(a,'/api/logs?type=account.updated');assert.equal(audit.data.rows.filter(row=>row.details.requestId===requestId).length,1,'A repeated CRUD request must create only one completion log');
  }finally{assert.equal((await request(a,'/api/banking/manage',{...change,requestId:randomUUID(),values:{name:account.name,status:account.status}})).status,200);}
  const restored=(await request(a,'/api/banking')).data;for(const original of snapshot.accounts)assert.equal(restored.accounts.find(row=>row.id===original.id).balanceCents,original.balanceCents);
  console.log('Hosted logs: customer/admin RLS, all-user dropdown, user/type filtering, pagination snapshot, immutable writes, spoof prevention and details-exclusion search passed. Test activity is retained; no balances changed.');
}finally{for(const session of sessions)await session.client.auth.signOut({scope:'local'});}
