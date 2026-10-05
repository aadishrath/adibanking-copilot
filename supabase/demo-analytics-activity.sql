-- Representative current-month activity, once per demo user/month. User edits
-- are preserved by the existing mutation audit/retry records.
begin;
do $$
declare u record; a uuid; item record; key uuid; month text;
begin
  month:=to_char(now() at time zone 'America/Los_Angeles','YYYY-MM');
  for u in select id from auth.users where email in ('admin@adibank.example','maya@adibank.example','alex@adibank.example') loop
    perform set_config('request.jwt.claim.sub',u.id::text,true);
    select id into a from public.accounts where user_id=u.id and account_type='checking' order by created_at,id limit 1;
    if a is null then raise exception 'Seed demo accounts first'; end if;
    for item in select * from (values
      (1,'Current-month salary',320000,'income'),(2,'Current-month rent',-125000,'housing'),
      (3,'Fresh Market groceries',-8239,'groceries'),(4,'Lunch with friends',-2400,'dining'),
      (5,'Mobile and internet',-5999,'utilities'),(6,'City transit',-3900,'transport')
    ) entries(n,description,cents,category) loop
      key:=md5('adibank-analytics-v1:'||u.id||':'||month||':'||item.n)::uuid;
      perform public.manage_banking_record('transactions','create',key,
        jsonb_build_object('account_id',a,'description',item.description,'amount_cents',item.cents,'category',item.category),key);
    end loop;
  end loop;
end;
$$;
commit;
