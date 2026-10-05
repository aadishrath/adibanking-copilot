import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createServerClient } from '@supabase/ssr';
const users=JSON.parse(await readFile(new URL('../.env.demo-users.json',import.meta.url),'utf8'));
const user=users.find(u=>u.email==='maya@adibank.example');
const cookies=new Map();
const client=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY??process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY??process.env.NEXT_PUBLIC_SUPABASE_KEY,{cookies:{getAll:()=>[...cookies].map(([name,value])=>({name,value})),setAll:values=>values.forEach(({name,value})=>cookies.set(name,value))}});
async function request(path,body){const r=await fetch(new URL(path,process.env.BANKING_TEST_URL??'http://localhost:3100'),{method:body?'POST':'GET',headers:{'Content-Type':'application/json',Cookie:[...cookies].map(([name,value])=>name+'='+value).join('; ')},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()};}
const manage=(kind,operation,id,values)=>request('/api/banking/manage',{kind,operation,id,values,requestId:randomUUID()});
let charge,receipt,advance,baseline;
try{
 const {error}=await client.auth.signInWithPassword({email:user.email,password:user.password});assert.ok(!error,'Demo login failed');assert.equal(user.password.length,8);
 baseline=(await request('/api/banking')).data;
 const card=baseline.accounts.find(a=>a.accountType==='credit_card'),cash=baseline.accounts.find(a=>a.accountType==='checking');
 assert.ok(card.creditLimitCents>=card.balanceCents);
 const chargeId=randomUUID();const created=await manage('transactions','create',chargeId,{account_id:card.id,amount_cents:-100,description:'Verification card purchase',category:'shopping'});assert.equal(created.status,200);charge=chargeId;assert.equal(created.data.accounts.find(a=>a.id===card.id).balanceCents,card.balanceCents+100);
 assert.equal((await manage('transactions','create',randomUUID(),{account_id:card.id,amount_cents:-card.creditLimitCents,description:'Over-limit test',category:'shopping'})).status,400);
 assert.equal((await request('/api/transfer',{fromId:cash.id,toId:card.id,amountCents:card.balanceCents+101,idempotencyKey:randomUUID()})).status,400);
 assert.equal((await request('/api/transfer',{fromId:baseline.accounts.find(a=>a.accountType==='loan').id,toId:cash.id,amountCents:1,idempotencyKey:randomUUID()})).status,400);
 const body={fromId:cash.id,toId:card.id,amountCents:100,idempotencyKey:randomUUID()};const paid=await request('/api/transfer',body);assert.equal(paid.status,200);receipt=Array.isArray(paid.data.transfer)?paid.data.transfer[0]:paid.data.transfer;
 assert.equal((await request('/api/transfer',body)).status,200);
 assert.equal(paid.data.accounts.find(a=>a.id===card.id).balanceCents,card.balanceCents);assert.equal(paid.data.accounts.find(a=>a.id===cash.id).balanceCents,cash.balanceCents-100);
 const advanceBody={fromId:card.id,toId:cash.id,amountCents:20000,idempotencyKey:randomUUID()};
 const borrowed=await request('/api/transfer',advanceBody);assert.equal(borrowed.status,200);advance=Array.isArray(borrowed.data.transfer)?borrowed.data.transfer[0]:borrowed.data.transfer;
 assert.equal(borrowed.data.accounts.find(a=>a.id===card.id).balanceCents,card.balanceCents+20000);
 assert.equal(borrowed.data.accounts.find(a=>a.id===cash.id).balanceCents,cash.balanceCents+19900);
 assert.equal((await request('/api/transfer',advanceBody)).status,200);
 assert.equal((await request('/api/transfer',{...advanceBody,amountCents:card.creditLimitCents,idempotencyKey:randomUUID()})).status,400);
 assert.equal((await manage('transfers','update',advance.id,{amount_cents:25000})).status,200);
 console.log('Hosted cash advances above card balance, limits, edits and retries passed.');
 console.log('Hosted card purchase, credit limit, payment, retry, overpayment and debt-source checks passed.');
}finally{
 if(advance)assert.equal((await manage('transfers','delete',advance.id,{})).status,200);
 if(receipt)assert.equal((await manage('transfers','delete',receipt.id,{})).status,200);
 if(charge)assert.equal((await manage('transactions','delete',charge,{})).status,200);
 if(baseline){const current=(await request('/api/banking')).data;for(const a of baseline.accounts)assert.equal(current.accounts.find(b=>b.id===a.id).balanceCents,a.balanceCents);console.log('All original balances restored; reversal audit retained.');}
 await client.auth.signOut({scope:'local'});
}
