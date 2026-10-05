-- Run after the banking migration. Creates opening balances for existing demo
-- users only. Repeat executions preserve accounts, balances, and transactions.
begin;
insert into public.accounts(user_id, name, account_type, currency, balance_cents)
select u.id, seed.name, seed.account_type, 'USD', seed.cents
from auth.users u cross join (values ('Checking', 'checking', 420050::bigint), ('Savings', 'savings', 1500000::bigint)) seed(name, account_type, cents)
where u.email in ('admin@adibank.example', 'maya@adibank.example', 'alex@adibank.example')
and not exists (select 1 from public.accounts a where a.user_id = u.id and a.account_type = seed.account_type);
insert into public.transactions(user_id, account_id, amount_cents, currency, description, category)
select a.user_id, a.id, a.balance_cents * case when a.account_type in ('mortgage','loan','credit_card') then -1 else 1 end, a.currency, 'Opening balance', 'opening'
from public.accounts a join auth.users u on u.id = a.user_id
where u.email in ('admin@adibank.example', 'maya@adibank.example', 'alex@adibank.example')
and a.balance_cents > 0 and not exists (select 1 from public.transactions t where t.account_id = a.id);
commit;
