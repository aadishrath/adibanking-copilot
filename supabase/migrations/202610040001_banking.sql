begin;

-- The configured project has two empty prototype tables. Preserve them in an
-- unexposed schema before creating the canonical banking tables. Never guess
-- ownership or rewrite populated/unknown schemas. This entire upgrade is atomic.
do $$
declare
  v_accounts regclass := to_regclass('public.accounts');
  v_transactions regclass := to_regclass('public.transactions');
  v_columns text[];
begin
  if v_accounts is null and v_transactions is null then return; end if;
  if v_accounts is null or v_transactions is null or to_regclass('public.transfers') is not null then
    raise exception 'Banking tables already exist or are partially migrated. Review the schema before applying this migration.';
  end if;
  select array_agg(attname::text order by attname) into v_columns
    from pg_catalog.pg_attribute where attrelid = v_accounts and attnum > 0 and not attisdropped;
  if v_columns <> array['balance_cents','created_at','currency','id','name','user_id']::text[] then
    raise exception 'Unrecognized accounts schema. A reviewed data migration is required.';
  end if;
  select array_agg(attname::text order by attname) into v_columns
    from pg_catalog.pg_attribute where attrelid = v_transactions and attnum > 0 and not attisdropped;
  if v_columns <> array['account_id','amount_cents','created_at','description','id','metadata']::text[] then
    raise exception 'Unrecognized transactions schema. A reviewed data migration is required.';
  end if;
  lock table public.accounts, public.transactions in access exclusive mode;
  if exists (select 1 from public.accounts) or exists (select 1 from public.transactions) then
    raise exception 'Legacy banking tables contain data. Refusing to archive them; a reviewed data migration is required.';
  end if;
  if exists (
    select 1 from pg_catalog.pg_constraint
    where contype = 'f' and confrelid in (v_accounts, v_transactions)
      and conrelid not in (v_accounts, v_transactions)
  ) or exists (
    select 1 from pg_catalog.pg_depend d
    join pg_catalog.pg_rewrite r on d.classid = 'pg_rewrite'::regclass and d.objid = r.oid
    where d.refclassid = 'pg_class'::regclass and d.refobjid in (v_accounts, v_transactions)
  ) or exists (
    select 1 from pg_catalog.pg_trigger
    where tgrelid in (v_accounts, v_transactions) and not tgisinternal
  ) then
    raise exception 'Legacy tables have external dependencies or custom triggers. Review them before migrating.';
  end if;
  if exists (select 1 from pg_catalog.pg_namespace where nspname = 'banking_legacy') then
    raise exception 'banking_legacy already exists. Review migration history before proceeding.';
  end if;
  create schema banking_legacy;
  revoke all on schema banking_legacy from public, anon, authenticated;
  alter table public.accounts set schema banking_legacy;
  alter table public.transactions set schema banking_legacy;
  revoke all on banking_legacy.accounts, banking_legacy.transactions from public, anon, authenticated;
end;
$$;

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(name) between 1 and 100),
  account_type text not null check (account_type in ('checking', 'savings')),
  currency text not null check (currency in ('USD', 'EUR', 'GBP')),
  balance_cents bigint not null default 0 check (balance_cents between 0 and 9007199254740991),
  status text not null default 'active' check (status in ('active', 'frozen', 'closed')),
  created_at timestamptz not null default now(),
  unique (id, user_id)
);

create table public.transfers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  from_account_id uuid not null,
  to_account_id uuid not null,
  amount_cents bigint not null check (amount_cents between 1 and 100000000),
  currency text not null check (currency in ('USD', 'EUR', 'GBP')),
  idempotency_key uuid not null,
  created_at timestamptz not null default now(),
  check (from_account_id <> to_account_id),
  unique (user_id, idempotency_key),
  unique (id, user_id),
  foreign key (from_account_id, user_id) references public.accounts(id, user_id),
  foreign key (to_account_id, user_id) references public.accounts(id, user_id)
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null,
  transfer_id uuid,
  amount_cents bigint not null check (amount_cents between -9007199254740991 and 9007199254740991 and amount_cents <> 0),
  currency text not null check (currency in ('USD', 'EUR', 'GBP')),
  description text not null check (length(description) between 1 and 300),
  category text not null default 'other' check (length(category) between 1 and 50),
  created_at timestamptz not null default now(),
  foreign key (account_id, user_id) references public.accounts(id, user_id),
  foreign key (transfer_id, user_id) references public.transfers(id, user_id),
  unique (transfer_id, account_id)
);

create index accounts_user on public.accounts(user_id);
create index transactions_user_date on public.transactions(user_id, created_at desc, id);
create index transactions_account_date on public.transactions(account_id, created_at desc, id);
create index transfers_user_date on public.transfers(user_id, created_at desc);

alter table public.accounts enable row level security;
alter table public.transactions enable row level security;
alter table public.transfers enable row level security;
create policy own_accounts on public.accounts for select to authenticated using ((select auth.uid()) = user_id);
create policy own_transactions on public.transactions for select to authenticated using ((select auth.uid()) = user_id);
create policy own_transfers on public.transfers for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.accounts, public.transactions, public.transfers from anon, authenticated;
grant select on public.accounts, public.transactions, public.transfers to authenticated;
grant all on public.accounts, public.transactions, public.transfers to service_role;

create function public.transfer_funds(p_from uuid, p_to uuid, p_amount_cents bigint, p_idempotency_key uuid)
returns public.transfers
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_from public.accounts;
  v_to public.accounts;
  v_transfer public.transfers;
begin
  if v_user is null then raise exception 'Sign in to transfer funds' using errcode = '42501'; end if;
  if p_from is null or p_to is null or p_from = p_to or p_idempotency_key is null
     or p_amount_cents is null or p_amount_cents < 1 or p_amount_cents > 100000000 then
    raise exception 'Invalid transfer request' using errcode = '22023';
  end if;
  -- Serialize retries of the same request, then lock both accounts in stable order.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user::text || p_idempotency_key::text, 0));
  select * into v_transfer from public.transfers where user_id = v_user and idempotency_key = p_idempotency_key;
  if found then
    if v_transfer.from_account_id <> p_from or v_transfer.to_account_id <> p_to or v_transfer.amount_cents <> p_amount_cents then
      raise exception 'Idempotency key already used for another transfer' using errcode = '22023';
    end if;
    return v_transfer;
  end if;
  perform id from public.accounts where user_id = v_user and id in (p_from, p_to) order by id for update;
  select * into v_from from public.accounts where id = p_from and user_id = v_user;
  select * into v_to from public.accounts where id = p_to and user_id = v_user;
  if v_from.id is null or v_to.id is null then raise exception 'Account unavailable' using errcode = '42501'; end if;
  if v_from.status <> 'active' or v_to.status <> 'active' then raise exception 'Account is not active' using errcode = '22023'; end if;
  if v_from.currency <> v_to.currency then raise exception 'Currencies must match' using errcode = '22023'; end if;
  if v_from.balance_cents < p_amount_cents then raise exception 'Insufficient funds' using errcode = '22023'; end if;
  if v_to.balance_cents > 9007199254740991 - p_amount_cents then raise exception 'Destination balance limit exceeded' using errcode = '22023'; end if;
  insert into public.transfers(user_id, from_account_id, to_account_id, amount_cents, currency, idempotency_key)
    values(v_user, p_from, p_to, p_amount_cents, v_from.currency, p_idempotency_key) returning * into v_transfer;
  update public.accounts set balance_cents = balance_cents - p_amount_cents where id = p_from;
  update public.accounts set balance_cents = balance_cents + p_amount_cents where id = p_to;
  insert into public.transactions(user_id, account_id, transfer_id, amount_cents, currency, description, category)
    values(v_user, p_from, v_transfer.id, -p_amount_cents, v_from.currency, 'Transfer to ' || v_to.name, 'transfer'),
          (v_user, p_to, v_transfer.id, p_amount_cents, v_to.currency, 'Transfer from ' || v_from.name, 'transfer');
  return v_transfer;
end;
$$;
revoke all on function public.transfer_funds(uuid, uuid, bigint, uuid) from public, anon;
grant execute on function public.transfer_funds(uuid, uuid, bigint, uuid) to authenticated;

commit;
