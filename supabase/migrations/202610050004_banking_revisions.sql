-- Owner-scoped change tokens. Trigger writes commit/roll back with the banking change.
begin;
create table public.banking_revisions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  revision uuid not null default gen_random_uuid()
);
insert into public.banking_revisions(user_id)
select user_id from public.accounts union select user_id from public.transactions union select user_id from public.transfers;
alter table public.banking_revisions enable row level security;
revoke all on public.banking_revisions from public, anon, authenticated;
grant select on public.banking_revisions to authenticated;
grant all on public.banking_revisions to service_role;
create policy owner_active_revision on public.banking_revisions for select to authenticated
using (user_id = auth.uid() and public.has_active_banking_session());

create function public.rotate_banking_revision() returns trigger
language plpgsql security definer set search_path = '' as $$
declare owners uuid[]; owner_id uuid;
begin
  if tg_op = 'UPDATE' and new is not distinct from old then return null; end if;
  if tg_op = 'INSERT' then owners := array[new.user_id];
  elsif tg_op = 'DELETE' then owners := array[old.user_id];
  else owners := array[old.user_id, new.user_id]; end if;
  for owner_id in select distinct unnest(owners) loop
    -- During auth-user cascades the owner may already be gone.
    if exists(select 1 from auth.users where id = owner_id) then
      insert into public.banking_revisions(user_id, revision) values(owner_id, gen_random_uuid())
      on conflict(user_id) do update set revision = excluded.revision;
    end if;
  end loop;
  return null;
end $$;
revoke all on function public.rotate_banking_revision() from public, anon, authenticated;
create trigger accounts_revision after insert or update or delete on public.accounts for each row execute function public.rotate_banking_revision();
create trigger transactions_revision after insert or update or delete on public.transactions for each row execute function public.rotate_banking_revision();
create trigger transfers_revision after insert or update or delete on public.transfers for each row execute function public.rotate_banking_revision();

create function public.get_banking_revision() returns text
language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is null or not public.has_active_banking_session() then
    raise exception 'Session expired or revoked' using errcode = '42501';
  end if;
  return coalesce((select revision::text from public.banking_revisions where user_id = auth.uid()), '00000000-0000-0000-0000-000000000000');
end $$;
revoke all on function public.get_banking_revision() from public, anon;
grant execute on function public.get_banking_revision() to authenticated;
notify pgrst, 'reload schema';
commit;
