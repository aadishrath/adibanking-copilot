-- Reject expired/revoked Supabase sessions, including still-valid access JWTs after logout.
begin;
create function public.has_active_banking_session() returns boolean
language plpgsql stable security definer set search_path='' as $$
declare sid text := auth.jwt()->>'session_id';
begin
 if auth.uid() is null or sid is null or sid !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then return false; end if;
 return exists(select 1 from auth.sessions s where s.id=sid::uuid and s.user_id=auth.uid() and (s.not_after is null or s.not_after>now()));
end;
$$;
revoke all on function public.has_active_banking_session() from public,anon;
grant execute on function public.has_active_banking_session() to authenticated;
create policy active_session on public.accounts as restrictive for select to authenticated using ((select public.has_active_banking_session()));
create policy active_session on public.transactions as restrictive for select to authenticated using ((select public.has_active_banking_session()));
create policy active_session on public.transfers as restrictive for select to authenticated using ((select public.has_active_banking_session()));
create policy active_session on public.banking_changes as restrictive for select to authenticated using ((select public.has_active_banking_session()));
create or replace function public.transfer_funds(p_from uuid, p_to uuid, p_amount_cents bigint, p_idempotency_key uuid)
returns public.transfers
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_from public.accounts;
  v_to public.accounts;
  v_transfer public.transfers;
begin
  if v_user is null then raise exception 'Sign in to transfer funds' using errcode = '42501'; end if;
  if not (session_user in ('postgres','supabase_admin') and current_setting('role')='none') and not public.has_active_banking_session() then raise exception 'Session expired or revoked' using errcode='42501'; end if;
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
  if v_from.account_type in ('mortgage','loan') then raise exception 'Mortgage and loan accounts cannot fund transfers' using errcode = '22023'; end if;
  if v_from.currency <> v_to.currency then raise exception 'Currencies must match' using errcode = '22023'; end if;
  if not public.banking_valid_balance(v_from.account_type,v_from.balance_cents-p_amount_cents*public.banking_balance_sign(v_from.account_type),v_from.credit_limit_cents) then raise exception 'Insufficient funds or available credit' using errcode = '22023'; end if;
  if not public.banking_valid_balance(v_to.account_type,v_to.balance_cents+p_amount_cents*public.banking_balance_sign(v_to.account_type),v_to.credit_limit_cents) then raise exception 'Payment exceeds debt or credit limit exceeded' using errcode = '22023'; end if;
  insert into public.transfers(user_id, from_account_id, to_account_id, amount_cents, currency, idempotency_key)
    values(v_user, p_from, p_to, p_amount_cents, v_from.currency, p_idempotency_key) returning * into v_transfer;
  update public.accounts set balance_cents = balance_cents - p_amount_cents*public.banking_balance_sign(account_type) where id = p_from;
  update public.accounts set balance_cents = balance_cents + p_amount_cents*public.banking_balance_sign(account_type) where id = p_to;
  insert into public.transactions(user_id, account_id, transfer_id, amount_cents, currency, description, category)
    values(v_user, p_from, v_transfer.id, -p_amount_cents, v_from.currency, 'Transfer to ' || v_to.name, 'transfer'),
          (v_user, p_to, v_transfer.id, p_amount_cents, v_to.currency, 'Transfer from ' || v_from.name, 'transfer');
  return v_transfer;
end;
$$;

create or replace function public.manage_banking_record(p_kind text,p_operation text,p_id uuid,p_values jsonb,p_request_id uuid)
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
  if not (session_user in ('postgres','supabase_admin') and current_setting('role')='none') and not public.has_active_banking_session() then raise exception 'Session expired or revoked' using errcode='42501'; end if;
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
      insert into public.accounts(id,user_id,name,account_type,currency,credit_limit_cents)
      values(p_id,u,p_values->>'name',p_values->>'account_type',p_values->>'currency',case when p_values->>'account_type'='credit_card' then coalesce((p_values->>'credit_limit_cents')::bigint,500000) else null end) returning * into a;
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
    delta := (amount-case when p_operation='create' then 0 else t.amount_cents end)*public.banking_balance_sign(a.account_type);
    if a.account_type='credit_card' and p_operation<>'delete' and amount>0 then raise exception 'Use Transfers to pay credit cards; manual entries are purchases' using errcode='22023'; end if;
    if not public.banking_valid_balance(a.account_type,a.balance_cents+delta,a.credit_limit_cents) then raise exception 'Insufficient funds or balance limit exceeded' using errcode='22023'; end if;
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
      (status<>'active' or balance_cents+case when id=f.from_account_id then -delta*public.banking_balance_sign(account_type) else delta*public.banking_balance_sign(account_type) end < 0 or not public.banking_valid_balance(account_type,balance_cents+case when id=f.from_account_id then -delta*public.banking_balance_sign(account_type) else delta*public.banking_balance_sign(account_type) end,credit_limit_cents))) then
      raise exception 'Check account status and available funds before adjusting or reversing' using errcode='22023';
    end if;
    update public.accounts set balance_cents=balance_cents+case when id=f.from_account_id then -delta*public.banking_balance_sign(account_type) else delta*public.banking_balance_sign(account_type) end where id in(f.from_account_id,f.to_account_id);
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

commit;
