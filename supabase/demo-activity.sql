-- Idempotent sandbox activity for the three demo identities. Applies each entry
-- through the same atomic mutation function as the UI, preserving ledger totals.
begin;
do $$
declare u record; a uuid; savings uuid; item record; key uuid; existing boolean;
begin
  for u in select id from auth.users where email in ('admin@adibank.example','maya@adibank.example','alex@adibank.example') loop
    perform set_config('request.jwt.claim.sub',u.id::text,true);
    select id into a from public.accounts where user_id=u.id and account_type='checking' order by created_at,id limit 1;
    if a is null then raise exception 'Seed demo accounts before activity'; end if;
    for item in select * from (values
      (1,'Monthly salary',325000,'income'),(2,'Apartment rent',-125000,'housing'),
      (3,'Green Market groceries',-8642,'groceries'),(4,'Coffee House',-650,'dining'),
      (5,'Internet service',-5999,'utilities'),(6,'Metro pass',-4500,'transport'),
      (7,'Freelance project',48000,'income'),(8,'Bookshop',-2890,'shopping'),
      (9,'Weekend dinner',-7240,'dining'),(10,'Fitness membership',-3500,'health'),
      (11,'Electricity bill',-9120,'utilities'),(12,'Online subscription',-1499,'entertainment')
    ) entries(n,description,cents,category) loop
      key := md5('adibank-activity-v1:'||u.id||':'||item.n)::uuid;
      select exists(select 1 from public.banking_changes where id=key) into existing;
      perform public.manage_banking_record('transactions','create',key,
        jsonb_build_object('account_id',a,'amount_cents',item.cents,'description',item.description,'category',item.category),key);
      if not existing then update public.transactions set created_at=now()-(13-item.n)*interval '2 days' where id=key; end if;
    end loop;
    select id into savings from public.accounts where user_id=u.id and account_type='savings' order by created_at,id limit 1;
    if savings is not null then
      key := md5('adibank-demo-transfer-v1:'||u.id)::uuid;
      if not exists(select 1 from public.transfers where user_id=u.id and idempotency_key=key) then
        perform public.transfer_funds(a,savings,12500,key);
      end if;
    end if;
  end loop;
end;
$$;
commit;
