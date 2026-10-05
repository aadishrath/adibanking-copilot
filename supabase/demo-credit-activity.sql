-- Repeatable, isolated demonstration accounts and card purchases/payment.
begin;
do $$
declare u record; item record; a uuid; checking uuid; key uuid;
begin
 for u in select id from auth.users where email in ('admin@adibank.example','maya@adibank.example','alex@adibank.example') loop
  perform set_config('request.jwt.claim.sub',u.id::text,true);
  for item in select * from (values ('Retirement','retirement',2500000),('Investment','investment',1200000),('Mortgage','mortgage',17500000),('Loan','loan',850000),('Credit Card','credit_card',0)) v(name,kind,cents) loop
   key := md5('adibank-account-types-v1:'||u.id||':'||item.kind)::uuid;
   if not exists(select 1 from public.banking_changes where id=key) then
    perform public.manage_banking_record('accounts','create',key,jsonb_build_object('name',item.name,'account_type',item.kind,'currency','USD','credit_limit_cents',500000),key);
    if item.cents>0 then
     update public.accounts set balance_cents=item.cents where id=key;
     insert into public.transactions(user_id,account_id,amount_cents,currency,description,category)
      values(u.id,key,item.cents*public.banking_balance_sign(item.kind),'USD','Opening balance','opening');
    end if;
   end if;
  end loop;
  a := md5('adibank-account-types-v1:'||u.id||':credit_card')::uuid;
  for item in select * from (values (1,'Card · Green Market groceries',-8999,'groceries'),(2,'Card · Metro pass',-4600,'transport'),(3,'Card · Weekend dinner',-7500,'dining'),(4,'Card · Streaming subscription',-2500,'entertainment')) v(n,description,cents,category) loop
   key := md5('adibank-card-charge-v1:'||u.id||':'||item.n)::uuid;
   perform public.manage_banking_record('transactions','create',key,jsonb_build_object('account_id',a,'description',item.description,'category',item.category,'amount_cents',item.cents),key);
  end loop;
  select id into checking from public.accounts where user_id=u.id and account_type='checking' order by created_at,id limit 1;
  key := md5('adibank-card-payment-v1:'||u.id)::uuid;
  if not exists(select 1 from public.transfers where user_id=u.id and idempotency_key=key) then perform public.transfer_funds(checking,a,10000,key); end if;
 end loop;
end;
$$;
commit;
