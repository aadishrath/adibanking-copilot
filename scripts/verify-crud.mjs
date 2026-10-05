import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createServerClient } from '@supabase/ssr';
const baseUrl=process.env.BANKING_TEST_URL??'http://localhost:3100';
const sessions=[];
async function session(credential){
  const cookies=new Map();
  const client=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY??process.env.NEXT_PUBLIC_SUPABASE_KEY,{cookies:{getAll:()=>[...cookies].map(([name,value])=>({name,value})),setAll:values=>values.forEach(({name,value})=>value?cookies.set(name,value):cookies.delete(name))}});
  sessions.push(client);
  const {error}=await client.auth.signInWithPassword({email:credential.email,password:credential.password});assert.ok(!error,'Customer sign-in failed.');
  const request=async(path,body)=>{
    const response=await fetch(new URL(path,baseUrl),{method:body?'POST':'GET',headers:{Cookie:[...cookies].map(([name,value])=>`${name}=${value}`).join('; '),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});
    return {status:response.status,data:await response.json()};
  };
  return {client,request};
}
async function main(){
  const credentials=JSON.parse(await readFile(new URL('../.env.demo-users.json',import.meta.url),'utf8')).filter(user=>user.role==='customer');
  const a=await session(credentials[0]),b=await session(credentials[1]);
  const signedOut=await fetch(new URL('/api/banking/manage',baseUrl),{method:'POST'});assert.equal(signedOut.status,401);
  const baseline=(await a.request('/api/banking')).data;
  assert.equal(baseline.source,'supabase');
  const other=(await b.request('/api/banking')).data.accounts[0];
  const manage=(kind,operation,id,values,key=randomUUID())=>a.request('/api/banking/manage',{kind,operation,id,values,requestId:key});
  const id=randomUUID(),createKey=randomUUID(),creditId=randomUUID(),debitId=randomUUID();
  try{
    assert.equal((await manage('accounts','create',id,{name:'CRUD verification',account_type:'savings',currency:'USD'},createKey)).status,200);
    assert.equal((await manage('accounts','create',id,{name:'CRUD verification',account_type:'savings',currency:'USD'},createKey)).status,200);
    assert.equal((await manage('accounts','update',id,{name:'CRUD renamed',status:'active'})).status,200);
    assert.equal((await manage('accounts','update',other.id,{name:'Forbidden',status:'active'})).status,403);
    assert.equal((await manage('accounts','update',id,{name:'Unsafe',status:'active',balance_cents:999999})).status,400);
    assert.equal((await manage('transactions','create',creditId,{account_id:id,description:'Verification income',category:'income',amount_cents:10000})).status,200);
    assert.equal((await manage('transactions','create',debitId,{account_id:id,description:'Verification expense',category:'other',amount_cents:-100})).status,200);
    assert.equal((await manage('transactions','update',debitId,{description:'Updated expense',category:'dining',amount_cents:-250})).status,200);
    let snapshot=(await a.request('/api/banking')).data;
    assert.equal(snapshot.accounts.find(row=>row.id===id).balanceCents,9750);
    assert.equal((await manage('accounts','delete',id,{})).status,400);
    const key=randomUUID();assert.equal((await manage('transactions','delete',debitId,{},key)).status,200);assert.equal((await manage('transactions','delete',debitId,{},key)).status,200);
    const denied=await a.client.from('accounts').update({balance_cents:1}).eq('id',id);assert.ok(denied.error,'Direct balance writes must be denied.');
    console.log('Account/transaction CRUD, mutation ownership, direct-write denial and retry checks passed.');
    const from=baseline.accounts.find(row=>row.accountType==='checking'),to=baseline.accounts.find(row=>row.accountType==='savings');
    const body={fromId:from.id,toId:to.id,amountCents:29,idempotencyKey:randomUUID()};
    let receipt;
    try{
      const responses=await Promise.all([a.request('/api/transfer',body),a.request('/api/transfer',body),a.request('/api/transfer',body)]);
      for(const response of responses)assert.equal(response.status,200);
      const receipts=responses.map(response=>Array.isArray(response.data.transfer)?response.data.transfer[0]:response.data.transfer);
      receipt=receipts[0];assert.ok(receipts.every(row=>row.id===receipt.id),'Concurrent retries must produce one transfer.');
      assert.equal((await manage('transfers','update',receipt.id,{amount_cents:60})).status,200);
      snapshot=(await a.request('/api/banking')).data;
      assert.equal(snapshot.accounts.find(row=>row.id===from.id).balanceCents,from.balanceCents-60);
      const ledger=snapshot.transactions.find(row=>row.transferId===receipt.id);
      assert.equal((await manage('transactions','delete',ledger.id,{})).status,400);
      const reverseKey=randomUUID();assert.equal((await manage('transfers','delete',receipt.id,{},reverseKey)).status,200);assert.equal((await manage('transfers','delete',receipt.id,{},reverseKey)).status,200);
      // Updated amounts intentionally invalidate the original transfer payload;
      // it cannot silently recreate or move funds again after reversal.
      assert.ok([400,409].includes((await a.request('/api/transfer',body)).status));
      console.log('Concurrent transfer retries, amount updates, ledger protection, reversal and duplicate reversal checks passed.');
    }finally{
      const {data:posted}=await a.client.from('transfers').select('id,deleted_at').eq('idempotency_key',body.idempotencyKey).maybeSingle();
      if(posted&&!posted.deleted_at)assert.equal((await manage('transfers','delete',posted.id,{})).status,200,'Verification transfer cleanup failed.');
    }
  }finally{
    const snapshot=(await a.request('/api/banking')).data;
    for(const tx of [debitId,creditId])if(snapshot.transactions.some(row=>row.id===tx))assert.equal((await manage('transactions','delete',tx,{})).status,200,'Verification transaction cleanup failed.');
    if(snapshot.accounts.some(row=>row.id===id))assert.equal((await manage('accounts','delete',id,{})).status,200,'Verification account cleanup failed.');
  }
  const final=(await a.request('/api/banking')).data;
  for(const account of baseline.accounts)assert.equal(final.accounts.find(row=>row.id===account.id).balanceCents,account.balanceCents,'Original balances must be restored.');
  console.log('Verification records cleaned up and original balances restored. Reversed transfer/audit history is retained.');
}
try{await main();}catch(error){console.error(error instanceof assert.AssertionError?error.message:'CRUD verification failed. Check the app and connection; credentials were not logged.');process.exitCode=1;}finally{for(const client of sessions)await client.auth.signOut({scope:'local'});}
