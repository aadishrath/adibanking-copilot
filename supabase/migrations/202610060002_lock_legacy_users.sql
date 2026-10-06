begin;

-- The application uses auth.users through the server-side Auth admin API.
-- Preserve the old public table, but deny access through client API roles.
-- Safe on new projects where this legacy table does not exist.
do $$
begin
  if to_regclass('public.users') is not null then
    alter table public.users enable row level security;
    revoke all privileges on table public.users from public, anon, authenticated;
  end if;
end
$$;

commit;
