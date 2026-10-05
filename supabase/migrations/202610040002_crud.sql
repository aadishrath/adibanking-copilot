begin;
alter table public.transfers add column deleted_at timestamptz;
create table public.banking_changes (
  id uuid primary key,
  user_id uuid not null references auth.users(id),
  request jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  unique(user_id,id)
);
alter table public.banking_changes enable row level security;
create policy own_changes on public.banking_changes for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.banking_changes from public,anon,authenticated;
grant select on public.banking_changes to authenticated;
grant all on public.banking_changes to service_role;

create function public.manage_banking_record(p_kind text,p_operation text,p_id uuid,p_values jsonb,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  u uuid := auth.uid();
  a public.accounts;
  t public.transactions;
  f public.transfers;
  result jsonb;
  prior public.banking_changes;
  request jsonb := jsonb_build_object('kind',p_kind,'operation',p_operation,'id',p_id,'values',p_values);
  amount bigint;
  delta bigint;
begin
  if u is null then raise exception 'Sign in first' using errcode='42501'; end if;
  if p_kind is null or p_operation is null or p_id is null or p_request_id is null or p_values is null or jsonb_typeof(p_values) <> 'object'
    or p_kind not in ('accounts','transactions','transfers') or p_operation not in ('create','update','delete') then
    raise exception 'Invalid operation' using errcode='22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(u::text || p_request_id::text,0));
  select * into prior from public.banking_changes where id=p_request_id and user_id=u;
  if found then
    if prior.request <> request then raise exception 'Retry key belongs to another operation' using errcode='22023'; end if;
    return prior.result;
  end if;
  if p_kind='accounts' then
    if p_operation='create' then
      insert into public.accounts(id,user_id,name,account_type,currency)
      values(p_id,u,p_values->>'name',p_values->>'account_type',p_values->>'currency') returning * into a;
    else
      select * into a from public.accounts where id=p_id and user_id=u for update;
      if not found then raise exception 'Record unavailable' using errcode='42501'; end if;
      if p_operation='delete' then
        if a.balance_cents<>0 or exists(select 1 from public.transactions where account_id=p_id)
          or exists(select 1 from public.transfers where from_account_id=p_id or to_account_id=p_id) then
          raise exception 'Only zero-balance accounts without history can be deleted' using errcode='22023';
        end if;
        delete from public.accounts where id=p_id;
      else
        update public.accounts set name=p_values->>'name',status=p_values->>'status' where id=p_id returning * into a;
      end if;
    end if;
    result := to_jsonb(a);
  elsif p_kind='transactions' then
    if p_operation<>'create' then
      select * into t from public.transactions where id=p_id and user_id=u for update;
      if not found then raise exception 'Record unavailable' using errcode='42501'; end if;
      if t.transfer_id is not null or t.category in ('opening','reversal') then
        raise exception 'Manage transfer entries through Transfers; opening balances are protected' using errcode='22023';
      end if;
    end if;
    select * into a from public.accounts where id=case when p_operation='create' then (p_values->>'account_id')::uuid else t.account_id end and user_id=u for update;
    if not found then raise exception 'Record unavailable' using errcode='42501'; end if;
    if a.status<>'active' then raise exception 'Account must be active' using errcode='22023'; end if;
    amount := case when p_operation='delete' then 0 else (p_values->>'amount_cents')::bigint end;
    if p_operation<>'delete' and (amount is null or amount=0 or abs(amount)>100000000
      or p_values->>'category' in ('opening','transfer','reversal')) then raise exception 'Invalid transaction' using errcode='22023'; end if;
    delta := amount-case when p_operation='create' then 0 else t.amount_cents end;
    if a.balance_cents+delta not between 0 and 9007199254740991 then raise exception 'Insufficient funds or balance limit exceeded' using errcode='22023'; end if;
    update public.accounts set balance_cents=balance_cents+delta where id=a.id;
    if p_operation='create' then
      insert into public.transactions(id,user_id,account_id,amount_cents,currency,description,category)
      values(p_id,u,a.id,amount,a.currency,p_values->>'description',p_values->>'category') returning * into t;
    elsif p_operation='update' then
      update public.transactions set amount_cents=amount,description=p_values->>'description',category=p_values->>'category' where id=p_id returning * into t;
    else delete from public.transactions where id=p_id;
    end if;
    result := to_jsonb(t);
  else
    if p_operation='create' then raise exception 'Use the transfer service to create transfers' using errcode='22023'; end if;
    select * into f from public.transfers where id=p_id and user_id=u for update;
    if not found then raise exception 'Record unavailable' using errcode='42501'; end if;
    if f.deleted_at is not null then raise exception 'Transfer already reversed' using errcode='22023'; end if;
    perform id from public.accounts where user_id=u and id in(f.from_account_id,f.to_account_id) order by id for update;
    amount := case when p_operation='delete' then 0 else (p_values->>'amount_cents')::bigint end;
    if amount is null or amount<0 or amount>100000000 or (p_operation='update' and amount=0) then raise exception 'Invalid transfer amount' using errcode='22023'; end if;
    delta := amount-f.amount_cents;
    if exists(select 1 from public.accounts where id in(f.from_account_id,f.to_account_id) and
      (status<>'active' or balance_cents+case when id=f.from_account_id then -delta else delta end not between 0 and 9007199254740991)) then
      raise exception 'Check account status and available funds before adjusting or reversing' using errcode='22023';
    end if;
    update public.accounts set balance_cents=balance_cents+case when id=f.from_account_id then -delta else delta end where id in(f.from_account_id,f.to_account_id);
    if p_operation='delete' then
      update public.transfers set deleted_at=now() where id=p_id returning * into f;
      insert into public.transactions(user_id,account_id,amount_cents,currency,description,category)
      values(u,f.from_account_id,f.amount_cents,f.currency,'Reversal of transfer '||f.id,'reversal'),
        (u,f.to_account_id,-f.amount_cents,f.currency,'Reversal of transfer '||f.id,'reversal');
    else
      update public.transfers set amount_cents=amount where id=p_id returning * into f;
      update public.transactions set amount_cents=case when account_id=f.from_account_id then -amount else amount end where transfer_id=f.id;
    end if;
    result := to_jsonb(f);
  end if;
  insert into public.banking_changes(id,user_id,request,result) values(p_request_id,u,request,result);
  return result;
end;
$$;
revoke all on function public.manage_banking_record(text,text,uuid,jsonb,uuid) from public,anon;
grant execute on function public.manage_banking_record(text,text,uuid,jsonb,uuid) to authenticated;
-- A reversed transfer keeps its original retry key; replay cannot move funds again.
commit;
