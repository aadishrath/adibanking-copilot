import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {createServerClient} from '@supabase/ssr';
const base=process.env.SECURITY_TEST_URL??'http://localhost:3100',url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY??process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY??process.env.NEXT_PUBLIC_SUPABASE_KEY;
const endpoints=[['/api/accounts','GET'],['/api/transactions','GET'],['/api/banking','GET'],['/api/analytics','GET'],['/api/analytics/transactions?category=dining','GET'],['/api/transfer','POST'],['/api/banking/manage','POST'],['/api/assistant/chat','POST'],['/api/assistant/confirm','POST'],['/api/openai/chat','POST'],['/api/openai/transfer','POST']];
async function inventory(dir='app/api'){let all=[];for(const entry of await readdir(dir,{withFileTypes:true}))if(entry.isDirectory())all.push(...await inventory(dir+'/'+entry.name));else if(entry.name==='route.ts')all.push('/'+dir.replace('app/',''));return all;}
assert.deepEqual((await inventory()).sort(),endpoints.map(([p])=>p.split('?')[0]).sort(),'An API route is missing from the security audit.');
async function request(path,{cookie='',method='GET',body,headers={}}={}){const response=await fetch(new URL(path,base),{method,redirect:'manual',headers:{...(cookie?{Cookie:cookie}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{}),...headers},...(body!==undefined?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});const text=await response.text();let data;try{data=JSON.parse(text);}catch{}return {status:response.status,headers:response.headers,text,data};}
function privateResponse(r){assert.match(r.headers.get('cache-control')??'',/private/);assert.match(r.headers.get('cache-control')??'',/no-store/);}
async function denied(cookie=''){for(const [path,method] of endpoints){const r=await request(path,{method,cookie,...(method==='POST'?{body:{}}:{})});assert.equal(r.status,401,path+' must reject unauthenticated requests');assert.deepEqual(Object.keys(r.data).filter(k=>!['error','requestId'].includes(k)),[]);privateResponse(r);}}
await denied();await denied('sb-invalid-auth-token=invalid');
for(const path of ['/dashboard','/accounts','/transactions','/transfers','/profile','/admin/users'])for(const headers of [{},{RSC:'1','Next-Router-Prefetch':'1'}]){const r=await request(path+'?_rsc=security-audit',{headers});assert.ok([303,307].includes(r.status),path+' must redirect');assert.equal(new URL(r.headers.get('location'),base).pathname,'/login');privateResponse(r);}
for(const path of ['/mock-data/accounts.json','/mock-data/transactions.json','/.env.local','/.env.demo-users.json','/supabase/seed.sql','/lib/fixtures/accounts.json'])assert.equal((await request(path)).status,404,'Public fixtures must be removed.');
console.log('All 11 endpoints, malformed cookies, protected HTML/RSC pages, cache headers and public fixture checks passed.');
const credentials=JSON.parse(await readFile(new URL('../.env.demo-users.json',import.meta.url),'utf8')).filter(u=>u.role==='customer').slice(0,2),sessions=[];
try{
 for(const user of credentials){const cookies=new Map();const client=createServerClient(url,key,{cookies:{getAll:()=>[...cookies].map(([name,value])=>({name,value})),setAll:values=>values.forEach(({name,value})=>value?cookies.set(name,value):cookies.delete(name))}});const {data,error}=await client.auth.signInWithPassword({email:user.email,password:user.password});assert.ok(!error,'Demo sign-in failed');const session={client,cookies,id:data.user.id,token:data.session.access_token,cookie:[...cookies].map(([k,v])=>k+'='+v).join('; ')};sessions.push(session);session.snapshot=(await request('/api/banking',{cookie:session.cookie})).data;}
 const [a,b]=sessions;assert.ok(a&&b,'Two customers are required');
 const [head,payload,signature]=a.token.split('.');
 const forgedPayload=JSON.parse(Buffer.from(payload,'base64url').toString('utf8'));forgedPayload.sub=b.id;forgedPayload.app_metadata={role:'admin'};forgedPayload.exp=0;
 const forgedToken=[head,Buffer.from(JSON.stringify(forgedPayload)).toString('base64url'),signature].join('.');
 const cookieName=[...a.cookies.keys()].find(name=>name.includes('-auth-token')).replace(/\.\d+$/,'');
 const forgedCookie=cookieName+'=base64-'+Buffer.from(JSON.stringify({access_token:forgedToken,refresh_token:'invalid',expires_at:0,token_type:'bearer',user:{id:b.id,app_metadata:{role:'admin'}}})).toString('base64url');
 await denied(forgedCookie);
 console.log('Forged expired cookies and admin/user JWT claims denied across all endpoints.');
 for(const session of sessions){const other=session===a?b:a;
 for(const path of ['/api/accounts','/api/transactions','/api/banking','/api/analytics','/api/analytics/transactions?category=groceries']){const r=await request(path+(path.includes('?')?'&':'?')+'userId='+other.id,{cookie:session.cookie});assert.equal(r.status,200);privateResponse(r);for(const row of other.snapshot.accounts)assert.ok(!r.text.includes(row.id),'Cross-user account exposure');for(const row of other.snapshot.transactions)assert.ok(!r.text.includes(row.id),'Cross-user transaction exposure');}
 const role=await request('/admin/users',{cookie:session.cookie,headers:{RSC:'1'}});assert.equal(role.status,307);assert.equal(new URL(role.headers.get('location'),base).pathname,'/dashboard');
 const cs=await request('/api/transfer',{cookie:session.cookie,method:'POST',body:{},headers:{Origin:'https://attacker.example','Sec-Fetch-Site':'cross-site'}});assert.equal(cs.status,403);
 const transfer=await request('/api/transfer',{cookie:session.cookie,method:'POST',body:{fromId:session.snapshot.accounts[0].id,toId:other.snapshot.accounts[0].id,amountCents:1,idempotencyKey:randomUUID()}});assert.equal(transfer.status,403);
 for(const [kind,id,values] of [['accounts',other.snapshot.accounts[0].id,{name:'Unauthorized',status:'active'}],['transactions',other.snapshot.transactions[0].id,{amount_cents:-1,description:'Unauthorized',category:'other'}],['transfers',other.snapshot.transfers[0].id,{amount_cents:1}]])assert.equal((await request('/api/banking/manage',{cookie:session.cookie,method:'POST',body:{kind,operation:'update',id,requestId:randomUUID(),values}})).status,403);
 for(const table of ['accounts','transactions','transfers','banking_changes']){const {data,error}=await session.client.from(table).select('id,user_id');assert.ok(!error);assert.ok(data.every(row=>row.user_id===session.id));const write=await session.client.from(table).delete().eq('user_id',other.id);assert.ok(write.error,'Direct write must be denied');}
 }
 console.log('Both customer sessions: API/RPC ownership, admin denial, direct-write denial and cross-origin mutation checks passed.');
 const saved=a.cookie,jwt=a.token;assert.ok(!(await a.client.auth.signOut({scope:'local'})).error);await denied(saved);await denied();
 for(const table of ['accounts','transactions','transfers','banking_changes']){const r=await fetch(url+'/rest/v1/'+table+'?select=id',{headers:{apikey:key,Authorization:'Bearer '+jwt},signal:AbortSignal.timeout(15000)});assert.equal(r.status,200);assert.deepEqual(await r.json(),[],'Logged-out JWT must not read '+table);}
 for(const [rpc,body] of [['transfer_funds',{p_from:a.snapshot.accounts[0].id,p_to:a.snapshot.accounts[1].id,p_amount_cents:1,p_idempotency_key:randomUUID()}],['manage_banking_record',{p_kind:'accounts',p_operation:'update',p_id:a.snapshot.accounts[0].id,p_values:{name:'Unauthorized',status:'active'},p_request_id:randomUUID()}]]){const r=await fetch(url+'/rest/v1/rpc/'+rpc,{method:'POST',headers:{apikey:key,Authorization:'Bearer '+jwt,'Content-Type':'application/json'},body:JSON.stringify(body)});assert.ok([401,403].includes(r.status),'Logged-out JWT must not mutate through '+rpc);}
 console.log('Replayed logout cookies/JWTs denied by app, all four database policies, and both write RPCs.');
 for(const s of sessions){const service=(await request('/api/banking',{cookie:s.cookie}));if(s===b){assert.equal(service.status,200);for(const original of s.snapshot.accounts)assert.equal(service.data.accounts.find(r=>r.id===original.id).balanceCents,original.balanceCents);}}
 console.log('No security test changed account balances.');
}finally{for(const s of sessions)await s.client.auth.signOut({scope:'local'});}
