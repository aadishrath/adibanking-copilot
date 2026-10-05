import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { randomUUID } from 'node:crypto';

test('banking migration: RLS, exact cents, atomicity and idempotency', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create schema auth;
      create table auth.users(id uuid primary key, email text);
      create role authenticated;
      create role anon;
      create role service_role bypassrls;
      create function auth.uid() returns uuid language sql stable as
        $$select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid$$;
      grant usage on schema auth to authenticated, anon;
      grant execute on function auth.uid() to authenticated, anon;
      insert into auth.users values
        ('00000000-0000-0000-0000-000000000001','maya@adibank.example'),
        ('00000000-0000-0000-0000-000000000002','alex@adibank.example');
    `);
    await db.exec(await readFile(new URL('../supabase/migrations/202610040001_banking.sql', import.meta.url), 'utf8'));
    const seed = await readFile(new URL('../supabase/seed.sql', import.meta.url), 'utf8');
    await db.exec(seed);
    await db.exec(seed);
    assert.equal((await db.query('select count(*)::int as count from public.accounts')).rows[0].count, 4);
    assert.equal((await db.query('select count(*)::int as count from public.transactions')).rows[0].count, 4);
    const all = (await db.query('select id,user_id,account_type,balance_cents from public.accounts')).rows;
    const maya = '00000000-0000-0000-0000-000000000001';
    const owned = all.filter(row => row.user_id === maya);
    const checking = owned.find(row => row.account_type === 'checking').id;
    const savings = owned.find(row => row.account_type === 'savings').id;
    const other = all.find(row => row.user_id !== maya).id;
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [maya]);
    await db.exec('set role authenticated');
    assert.equal((await db.query('select * from public.accounts')).rows.length, 2);
    assert.equal((await db.query('select * from public.transactions')).rows.length, 2);
    await assert.rejects(db.query('update public.accounts set balance_cents = 99999999'), /permission denied/);
    await assert.rejects(db.query('insert into public.accounts(user_id,name,account_type,currency) values ($1,\'Illegal\',\'checking\',\'USD\')', [maya]), /permission denied/);
    const transfer = (from, to, amount, key) => db.query('select (public.transfer_funds($1,$2,$3,$4)).*', [from, to, amount, key]);
    const key = '10000000-0000-0000-0000-000000000001';
    const first = await transfer(checking, savings, 29, key);
    const retry = await transfer(checking, savings, 29, key);
    assert.equal(first.rows[0].id, retry.rows[0].id);
    const balances = (await db.query('select id,balance_cents from public.accounts')).rows;
    assert.equal(Number(balances.find(row => row.id === checking).balance_cents), 420021);
    assert.equal(Number(balances.find(row => row.id === savings).balance_cents), 1500029);
    assert.equal((await db.query('select * from public.transfers')).rows.length, 1);
    const entries = (await db.query("select amount_cents from public.transactions where category = 'transfer'")).rows;
    assert.equal(entries.length, 2);
    assert.equal(entries.reduce((sum, row) => sum + Number(row.amount_cents), 0), 0);
    await assert.rejects(transfer(checking, savings, 30, key), /Idempotency/);
    await assert.rejects(transfer(checking, other, 1, '10000000-0000-0000-0000-000000000002'), /Account unavailable/);
    await assert.rejects(transfer(checking, savings, 999999, '10000000-0000-0000-0000-000000000003'), /Insufficient funds/);
    await assert.rejects(transfer(checking, savings, -1, '10000000-0000-0000-0000-000000000004'), /Invalid transfer/);
    assert.equal((await db.query('select * from public.transfers')).rows.length, 1);
    await db.exec('reset role');
    await db.exec(`create function public.reject_test_entry() returns trigger language plpgsql as $$begin raise exception 'forced ledger failure'; end;$$;
      create trigger reject_test_entry before insert on public.transactions for each row execute function public.reject_test_entry();
      set role authenticated;`);
    await assert.rejects(transfer(checking, savings, 100, '10000000-0000-0000-0000-000000000005'), /forced ledger failure/);
    assert.equal((await db.query('select * from public.transfers')).rows.length, 1);
    const afterFailure = (await db.query('select id,balance_cents from public.accounts')).rows;
    assert.equal(Number(afterFailure.find(row => row.id === checking).balance_cents), 420021);
    assert.equal(Number(afterFailure.find(row => row.id === savings).balance_cents), 1500029);
    await db.exec('reset role; drop trigger reject_test_entry on public.transactions; drop function public.reject_test_entry();');
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", ['00000000-0000-0000-0000-000000000002']);
    await db.exec('set role authenticated');
    assert.equal((await db.query('select * from public.transfers')).rows.length, 0);
    await db.exec('reset role; set role anon');
    await assert.rejects(db.query('select * from public.accounts'), /permission denied/);
    await assert.rejects(transfer(checking, savings, 1, key), /permission denied/);
  } finally { await db.close(); }
});

async function legacyDatabase() {
  const db = new PGlite();
  await db.exec(`
    create schema auth;
    create table auth.users(id uuid primary key, email text);
    create role authenticated;
    create role anon;
    create role service_role bypassrls;
    create function auth.uid() returns uuid language sql stable as
      $$select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid$$;
    grant usage on schema auth to authenticated, anon;
    grant execute on function auth.uid() to authenticated, anon;
    create table public.accounts (
      id uuid primary key default gen_random_uuid(), name text not null,
      balance_cents bigint not null default 0, currency text not null,
      user_id uuid references auth.users(id), created_at timestamptz default now()
    );
    create table public.transactions (
      id uuid primary key default gen_random_uuid(), account_id uuid not null references public.accounts(id),
      amount_cents bigint not null, description text, metadata jsonb, created_at timestamptz default now()
    );
    grant usage on schema public to authenticated, anon;
    grant all on public.accounts, public.transactions to authenticated, anon;
    insert into auth.users values ('00000000-0000-0000-0000-000000000001','maya@adibank.example');
  `);
  return db;
}
const migrationSql = () => readFile(new URL('../supabase/migrations/202610040001_banking.sql', import.meta.url), 'utf8');

test('empty prototype upgrade preserves legacy tables privately and seeds isolated canonical accounts', async () => {
  const db = await legacyDatabase();
  try {
    await db.exec(await migrationSql());
    assert.equal((await db.query('select count(*)::int as count from banking_legacy.accounts')).rows[0].count, 0);
    await db.exec(await readFile(new URL('../supabase/seed.sql', import.meta.url), 'utf8'));
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", ['00000000-0000-0000-0000-000000000001']);
    await db.exec('set role authenticated');
    assert.equal((await db.query('select * from public.accounts')).rows.length, 2);
    await assert.rejects(db.query('select * from banking_legacy.accounts'), /permission denied/);
    await assert.rejects(db.query('update public.accounts set balance_cents = 100'), /permission denied/);
    await db.exec('reset role; set role anon');
    await assert.rejects(db.query('select * from public.accounts'), /permission denied/);
    await assert.rejects(db.query('select * from banking_legacy.transactions'), /permission denied/);
  } finally { await db.close(); }
});

test('populated prototype upgrade refuses to move data and rolls back', async () => {
  const db = await legacyDatabase();
  try {
    await db.exec("insert into public.accounts(name,currency,balance_cents) values ('Unassigned','USD',12345)");
    await assert.rejects(db.exec(await migrationSql()), /contain data/);
    await db.exec('rollback');
    assert.equal(Number((await db.query('select balance_cents from public.accounts')).rows[0].balance_cents), 12345);
    assert.equal((await db.query("select to_regnamespace('banking_legacy') as schema")).rows[0].schema, null);
  } finally { await db.close(); }
});

test('unknown schema and dependent views prevent prototype upgrades', async () => {
  const db = await legacyDatabase();
  try {
    await db.exec('alter table public.accounts add column custom_field text');
    await assert.rejects(db.exec(await migrationSql()), /Unrecognized accounts schema/);
    await db.exec('rollback; alter table public.accounts drop column custom_field; create view public.account_summary as select id from public.accounts');
    await assert.rejects(db.exec(await migrationSql()), /external dependencies/);
    await db.exec('rollback');
    assert.equal((await db.query("select to_regnamespace('banking_legacy') as schema")).rows[0].schema, null);
  } finally { await db.close(); }
});

test('a later migration failure restores the original prototype tables', async () => {
  const db = await legacyDatabase();
  try {
    // Fail after archival and canonical-table creation, before COMMIT.
    await db.exec('create function public.transfer_funds(uuid,uuid,bigint,uuid) returns integer language sql as $$select 1$$');
    await assert.rejects(db.exec(await migrationSql()), /already exists/);
    await db.exec('rollback');
    const columns = (await db.query("select column_name from information_schema.columns where table_schema='public' and table_name='accounts'")).rows;
    assert.ok(!columns.some(row => row.column_name === 'account_type'));
    assert.equal((await db.query("select to_regnamespace('banking_legacy') as schema")).rows[0].schema, null);
    assert.equal((await db.query("select to_regclass('public.transfers') as table_name")).rows[0].table_name, null);
  } finally { await db.close(); }
});

test('sandbox CRUD preserves balances, ownership, protected history, retries and seed repeatability', async () => {
  const db=await legacyDatabase();
  try {
    await db.exec(await migrationSql());
    await db.exec(await readFile(new URL('../supabase/migrations/202610040002_crud.sql',import.meta.url),'utf8'));
    await db.exec(await readFile(new URL('../supabase/seed.sql',import.meta.url),'utf8'));
    const activity=await readFile(new URL('../supabase/demo-activity.sql',import.meta.url),'utf8');
    await db.exec(activity);
    const before=(await db.query('select sum(balance_cents)::text as total from public.accounts')).rows[0].total;
    await db.exec(activity);
    assert.equal((await db.query('select sum(balance_cents)::text as total from public.accounts')).rows[0].total,before);
    assert.equal((await db.query('select count(*)::int as n from public.transactions')).rows[0].n,16);
    const user='00000000-0000-0000-0000-000000000001';
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);
    await db.exec('set role authenticated');
    const mutate=async(kind,operation,id,values,key=randomUUID())=>(await db.query('select public.manage_banking_record($1,$2,$3,$4,$5) as record',[kind,operation,id,JSON.stringify(values),key])).rows[0].record;
    const id=randomUUID();const key=randomUUID();
    const values={name:'Travel',account_type:'savings',currency:'USD'};
    await mutate('accounts','create',id,values,key);
    await mutate('accounts','create',id,values,key);
    await assert.rejects(mutate('accounts','create',id,{...values,name:'Different'},key),/Retry key/);
    await mutate('accounts','update',id,{name:'Holiday fund',status:'active'});
    const credit=randomUUID(),debit=randomUUID();
    await mutate('transactions','create',credit,{account_id:id,amount_cents:50000,description:'Income',category:'income'});
    await mutate('transactions','create',debit,{account_id:id,amount_cents:-1000,description:'Lunch',category:'dining'});
    await mutate('transactions','update',debit,{amount_cents:-2500,description:'Dinner',category:'dining'});
    assert.equal(Number((await db.query('select balance_cents from public.accounts where id=$1',[id])).rows[0].balance_cents),47500);
    const deletionKey=randomUUID();
    await mutate('transactions','delete',debit,{},deletionKey);
    await mutate('transactions','delete',debit,{},deletionKey);
    await assert.rejects(mutate('accounts','delete',id,{}),/zero-balance/);
    await assert.rejects(mutate('transactions','create',randomUUID(),{account_id:id,amount_cents:-90000,description:'Too much',category:'other'}),/Insufficient/);
    await assert.rejects(mutate('transactions','create',randomUUID(),{account_id:id,amount_cents:100,description:'',category:'other'}),/check constraint/);
    assert.equal(Number((await db.query('select balance_cents from public.accounts where id=$1',[id])).rows[0].balance_cents),50000);
    const posted=(await db.query('select * from public.transfers')).rows[0];
    await mutate('transfers','update',posted.id,{amount_cents:25000});
    assert.equal(Number((await db.query('select amount_cents from public.transactions where transfer_id=$1 and account_id=$2',[posted.id,posted.from_account_id])).rows[0].amount_cents),-25000);
    const transferEntry=(await db.query('select id from public.transactions where transfer_id=$1',[posted.id])).rows[0].id;
    await assert.rejects(mutate('transactions','delete',transferEntry,{}),/protected/);
    const reverseKey=randomUUID();
    await mutate('transfers','delete',posted.id,{},reverseKey);
    await mutate('transfers','delete',posted.id,{},reverseKey);
    assert.ok((await db.query('select deleted_at from public.transfers where id=$1',[posted.id])).rows[0].deleted_at);
    assert.equal((await db.query("select * from public.transactions where category='reversal'")).rows.length,2);
    const reversal=(await db.query("select id from public.transactions where category='reversal'")).rows[0].id;
    await assert.rejects(mutate('transactions','delete',reversal,{}),/protected/);
    await mutate('transactions','delete',credit,{});
    await mutate('accounts','delete',id,{});
    assert.equal((await db.query('select * from public.accounts where id=$1',[id])).rows.length,0);
    assert.equal((await db.query('select a.id from public.accounts a left join public.transactions t on a.id=t.account_id group by a.id having a.balance_cents<>coalesce(sum(t.amount_cents),0)')).rows.length,0);
    await assert.rejects(db.query('update public.accounts set balance_cents=1'),/permission denied/);
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[randomUUID()]);
    await db.exec('set role authenticated');
    await assert.rejects(mutate('transfers','delete',posted.id,{}),/Record unavailable/);
    assert.equal((await db.query('select * from public.banking_changes')).rows.length,0);
    await db.exec('reset role; set role anon');
    await assert.rejects(mutate('accounts','create',randomUUID(),values),/permission denied/);
  }finally{await db.close();}
});

test('analytics aggregates full history by local calendar month, separates currencies and preserves owner isolation',async()=>{
  const db=await legacyDatabase();
  try{
    await db.exec(await migrationSql());
    for(const file of ['202610040002_crud.sql','202610040003_analytics.sql'])await db.exec(await readFile(new URL(`../supabase/migrations/${file}`,import.meta.url),'utf8'));
    await db.exec(await readFile(new URL('../supabase/seed.sql',import.meta.url),'utf8'));
    const user='00000000-0000-0000-0000-000000000001';
    const accounts=(await db.query('select id,account_type from public.accounts')).rows;
    const checking=accounts.find(row=>row.account_type==='checking').id,savings=accounts.find(row=>row.account_type==='savings').id;
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);
    await db.exec('set role authenticated');
    const mutate=async(id,cents,category)=>db.query("select public.manage_banking_record('transactions','create',$1,$2,$3)",[id,JSON.stringify({account_id:checking,amount_cents:cents,description:'Analytics entry',category}),randomUUID()]);
    await mutate(randomUUID(),12345,'income');
    await mutate(randomUUID(),-299,'groceries');
    for(let i=0;i<205;i++)await mutate(randomUUID(),-1,'other');
    const transfer=(await db.query('select (public.transfer_funds($1,$2,500,$3)).*',[checking,savings,randomUUID()])).rows[0];
    await db.query("select public.manage_banking_record('transfers','delete',$1,'{}'::jsonb,$2)",[transfer.id,randomUUID()]);
    await db.exec('reset role');
    const boundary=randomUUID();
    await mutate(boundary,555,'income');
    await db.query("update public.transactions set created_at=(date_trunc('month',now() at time zone 'America/Los_Angeles') at time zone 'America/Los_Angeles')-interval '30 minutes' where id=$1",[boundary]);
    const euro=randomUUID();
    await db.query("select public.manage_banking_record('accounts','create',$1,$2,$3)",[euro,JSON.stringify({name:'Euro',account_type:'checking',currency:'EUR'}),randomUUID()]);
    await db.query("select public.manage_banking_record('transactions','create',$1,$2,$3)",[randomUUID(),JSON.stringify({account_id:euro,amount_cents:90000,description:'Euro income',category:'income'}),randomUUID()]);
    await db.exec('set role authenticated');
    const analytics=(await db.query("select public.banking_analytics('USD','America/Los_Angeles') as data")).rows[0].data;
    assert.equal(analytics.months.length,6);
    const current=analytics.months.find(row=>row.month===analytics.month);
    assert.equal(current.incomeCents,12345);
    assert.equal(current.expenseCents,504);
    assert.equal(current.savingsCents,11841);
    assert.equal(analytics.months[1].incomeCents,555,'Local-month boundary must exclude a UTC-current but local-previous-month transaction.');
    assert.equal(analytics.categories.reduce((sum,row)=>sum+row.expenseCents,0),504);
    const details=(await db.query("select public.banking_category_transactions('other','USD','America/Los_Angeles') as data")).rows[0].data;
    assert.equal(details.transactions.length,205,'Chart details must not inherit the banking table 200-row limit.');
    assert.ok(details.transactions.every(row=>row.amountCents===-1));
    const euros=(await db.query("select public.banking_analytics('EUR','America/Los_Angeles') as data")).rows[0].data;
    assert.equal(euros.months[0].incomeCents,90000);
    await assert.rejects(db.query("select public.banking_analytics('USD','Invalid/Timezone')"),/Invalid/);
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[randomUUID()]);
    await db.exec('set role authenticated');
    const isolated=(await db.query("select public.banking_analytics('USD','America/Los_Angeles') as data")).rows[0].data;
    assert.ok(isolated.months.every(row=>row.incomeCents===0&&row.expenseCents===0));
    assert.equal(isolated.categories.length,0);
    assert.equal((await db.query("select public.banking_category_transactions('groceries','USD','America/Los_Angeles') as data")).rows[0].data.transactions.length,0);
    await db.exec('reset role; set role anon');
    await assert.rejects(db.query("select public.banking_analytics('USD','UTC')"),/permission denied/);
  }finally{await db.close();}
});
