import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServerClient } from '@supabase/ssr';
const baseUrl=process.env.BANKING_TEST_URL??'http://localhost:3100';
const timezone='America/Los_Angeles';
const clients=[];
try{
  for(const path of ['/api/analytics','/api/analytics/transactions?category=utilities'])assert.equal((await fetch(new URL(path,baseUrl))).status,401);
  const credentials=JSON.parse(await readFile(new URL('../.env.demo-users.json',import.meta.url),'utf8')).filter(user=>user.role==='customer');
  for(const credential of credentials){
    const cookies=new Map();
    const client=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY??process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY??process.env.NEXT_PUBLIC_SUPABASE_KEY,{cookies:{getAll:()=>[...cookies].map(([name,value])=>({name,value})),setAll:values=>values.forEach(({name,value})=>value?cookies.set(name,value):cookies.delete(name))}});
    clients.push(client);
    const {error}=await client.auth.signInWithPassword({email:credential.email,password:credential.password});assert.ok(!error,'Customer login failed.');
    const request=async(path)=>{
      const response=await fetch(new URL(path,baseUrl),{headers:{Cookie:[...cookies].map(([name,value])=>`${name}=${value}`).join('; ')},signal:AbortSignal.timeout(30000)});
      return {status:response.status,headers:response.headers,data:await response.json()};
    };
    const response=await request(`/api/analytics?currency=USD&timezone=${encodeURIComponent(timezone)}`);
    assert.equal(response.status,200);assert.ok(response.headers.get('Cache-Control').includes('no-store'));
    const summary=response.data;assert.equal(summary.months.length,6);
    const {data:rows,error:readError}=await client.from('transactions').select('id,amount_cents,currency,category,transfer_id,created_at');assert.ok(!readError);
    const formatter=new Intl.DateTimeFormat('en-US',{year:'numeric',month:'2-digit',timeZone:timezone});
    const monthOf=date=>{const parts=Object.fromEntries(formatter.formatToParts(new Date(date)).map(part=>[part.type,part.value]));return `${parts.year}-${parts.month}`;};
    const manual=rows.filter(row=>row.currency==='USD'&&!row.transfer_id&&!['opening','transfer','reversal'].includes(row.category));
    for(const month of summary.months){
      const activity=manual.filter(row=>monthOf(row.created_at)===month.month);
      const income=activity.filter(row=>row.amount_cents>0).reduce((sum,row)=>sum+row.amount_cents,0);
      const expenses=activity.filter(row=>row.amount_cents<0).reduce((sum,row)=>sum-row.amount_cents,0);
      assert.equal(month.incomeCents,income);assert.equal(month.expenseCents,expenses);assert.equal(month.savingsCents,income-expenses);
    }
    const current=summary.months.find(row=>row.month===summary.month);
    assert.equal(summary.categories.reduce((sum,row)=>sum+row.expenseCents,0),current.expenseCents);
    for(const slice of summary.categories){
      const detail=await request(`/api/analytics/transactions?${new URLSearchParams({category:slice.category,currency:'USD',timezone})}`);
      assert.equal(detail.status,200);assert.equal(detail.data.month,summary.month);
      assert.equal(detail.data.transactions.reduce((sum,row)=>sum-row.amountCents,0),slice.expenseCents);
      assert.ok(detail.data.transactions.every(row=>manual.some(owned=>owned.id===row.id&&owned.category===slice.category&&monthOf(owned.created_at)===summary.month&&owned.amount_cents<0)),'Details must contain only owned current-month category expenses.');
    }
    assert.equal((await request('/api/analytics?timezone=Unknown/Zone')).status,400);
    assert.equal((await request('/api/analytics/transactions')).status,400);
  }
  console.log('Two-customer analytics totals, savings, pie/detail reconciliation, current-month ownership, auth guards, and invalid-filter checks passed. No records changed.');
}catch(error){console.error(error instanceof assert.AssertionError?error.message:'Analytics verification failed; credentials were not logged.');process.exitCode=1;}
finally{for(const client of clients)await client.auth.signOut({scope:'local'});}
