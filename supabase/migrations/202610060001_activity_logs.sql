begin;
create table public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null,
  actor_name text not null,
  actor_email text not null,
  interaction_type text not null check(length(interaction_type) between 1 and 80),
  details jsonb not null default '{}' check(jsonb_typeof(details) = 'object'),
  created_at timestamptz not null default clock_timestamp()
);
create index activity_logs_time on public.activity_logs(created_at desc, id desc);
create index activity_logs_owner_time on public.activity_logs(actor_id, created_at desc, id desc);
alter table public.activity_logs enable row level security;
revoke all on public.activity_logs from public, anon, authenticated, service_role;
grant select on public.activity_logs to authenticated;
grant select, insert on public.activity_logs to service_role;

create function public.is_activity_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.has_active_banking_session() and exists(
    select 1 from auth.users where id = auth.uid() and raw_app_meta_data->>'role' = 'admin'
  );
$$;
revoke all on function public.is_activity_admin() from public, anon;
grant execute on function public.is_activity_admin() to authenticated;
create policy activity_visibility on public.activity_logs for select to authenticated
using ((select public.has_active_banking_session()) and (actor_id = (select auth.uid()) or (select public.is_activity_admin())));

-- Only trusted server code/triggers may supply an actor or a backend event.
create function public.record_activity(p_actor uuid, p_type text, p_details jsonb default '{}') returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.activity_logs(actor_id, actor_name, actor_email, interaction_type, details)
  select id, coalesce(nullif(raw_user_meta_data->>'full_name',''),email,'User'), coalesce(email,''), p_type, p_details
  from auth.users where id = p_actor;
  if not found then raise exception 'Activity actor unavailable'; end if;
end $$;
revoke all on function public.record_activity(uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.record_activity(uuid,text,jsonb) to service_role;

create function public.activity_filter_users() returns table(id uuid, name text, email text)
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_activity_admin() then raise exception 'Administrator access required' using errcode='42501'; end if;
  return query select u.id, coalesce(nullif(u.raw_user_meta_data->>'full_name',''),u.email::text,'User'), coalesce(u.email::text,'') from auth.users u order by 2, 1;
end $$;
revoke all on function public.activity_filter_users() from public, anon;
grant execute on function public.activity_filter_users() to authenticated;

create function public.log_banking_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare kind text; operation text;
begin
  kind := case new.request->>'kind' when 'accounts' then 'account' when 'transactions' then 'transaction' else 'transfer' end;
  operation := case new.request->>'operation' when 'create' then 'created' when 'update' then 'updated' else case when kind='transfer' then 'reversed' else 'deleted' end end;
  perform public.record_activity(new.user_id, kind || '.' || operation,
    jsonb_build_object('summary', initcap(kind) || ' ' || operation || '.', 'recordId',new.request->>'id', 'requestId',new.id,
      'amountCents',coalesce(new.result->'amount_cents',new.request->'values'->'amount_cents'), 'currency',new.result->>'currency',
      'name',new.result->>'name','category',new.result->>'category'));
  return null;
end $$;
revoke all on function public.log_banking_change() from public, anon, authenticated;
create trigger banking_change_activity after insert on public.banking_changes for each row execute function public.log_banking_change();

create function public.log_transfer_created() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.record_activity(new.user_id,'transfer.created', jsonb_build_object('summary','Transfer completed.', 'recordId',new.id,
    'amountCents',new.amount_cents,'currency',new.currency,
    'fromAccount',(select name from public.accounts where id=new.from_account_id),
    'toAccount',(select name from public.accounts where id=new.to_account_id)));
  return null;
end $$;
revoke all on function public.log_transfer_created() from public, anon, authenticated;
create trigger transfer_activity after insert on public.transfers for each row execute function public.log_transfer_created();
notify pgrst, 'reload schema';
commit;
