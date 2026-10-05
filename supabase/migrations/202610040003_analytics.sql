begin;
-- Invoker functions keep the caller's RLS permissions. No service-role reads.
create function public.banking_analytics(p_currency text,p_timezone text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare current_month date; start_month date; result jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode='42501'; end if;
  if p_currency is null or p_currency not in ('USD','EUR','GBP') or p_timezone is null
    or not exists(select 1 from pg_catalog.pg_timezone_names where name=p_timezone) then
    raise exception 'Invalid currency or time zone' using errcode='22023';
  end if;
  current_month := date_trunc('month',now() at time zone p_timezone)::date;
  start_month := (current_month-interval '5 months')::date;
  with activity as (
    select amount_cents,category,date_trunc('month',created_at at time zone p_timezone)::date as month
    from public.transactions where user_id=(select auth.uid()) and currency=p_currency
      and transfer_id is null and category not in ('opening','transfer','reversal')
      and created_at >= (start_month::timestamp at time zone p_timezone)
      and created_at < ((current_month+interval '1 month')::timestamp at time zone p_timezone)
  ), months as (
    select series::date as month from generate_series(start_month::timestamp,current_month::timestamp,interval '1 month') series
  ), totals as (
    select m.month,coalesce(sum(a.amount_cents) filter(where a.amount_cents>0),0) as income,
      coalesce(-sum(a.amount_cents) filter(where a.amount_cents<0),0) as expenses
    from months m left join activity a on a.month=m.month group by m.month
  ), categories as (
    select category,-sum(amount_cents) as cents from activity where month=current_month and amount_cents<0 group by category
  ) select jsonb_build_object(
    'currency',p_currency,'timezone',p_timezone,'month',to_char(current_month,'YYYY-MM'),
    'months',(select jsonb_agg(jsonb_build_object('month',to_char(month,'YYYY-MM'),'incomeCents',income,'expenseCents',expenses,'savingsCents',income-expenses) order by month desc) from totals),
    'categories',coalesce((select jsonb_agg(jsonb_build_object('category',category,'expenseCents',cents) order by cents desc,category) from categories),'[]'::jsonb)
  ) into result;
  return result;
end;
$$;

create function public.banking_category_transactions(p_category text,p_currency text,p_timezone text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare current_month date; result jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode='42501'; end if;
  if p_category is null or length(p_category) not between 1 and 50 or p_currency is null
    or p_currency not in ('USD','EUR','GBP') or p_timezone is null
    or not exists(select 1 from pg_catalog.pg_timezone_names where name=p_timezone) then
    raise exception 'Invalid category, currency or time zone' using errcode='22023';
  end if;
  current_month := date_trunc('month',now() at time zone p_timezone)::date;
  select jsonb_build_object('month',to_char(current_month,'YYYY-MM'),'currency',p_currency,
    'transactions',coalesce(jsonb_agg(jsonb_build_object('id',t.id,'description',t.description,'amountCents',t.amount_cents,
      'createdAt',t.created_at,'accountName',a.name) order by t.created_at desc,t.id),'[]'::jsonb)) into result
  from public.transactions t join public.accounts a on a.id=t.account_id
  where t.user_id=(select auth.uid()) and t.currency=p_currency and t.category=p_category
    and t.amount_cents<0 and t.transfer_id is null and t.category not in ('opening','transfer','reversal')
    and t.created_at >= (current_month::timestamp at time zone p_timezone)
    and t.created_at < ((current_month+interval '1 month')::timestamp at time zone p_timezone);
  return result;
end;
$$;
revoke all on function public.banking_analytics(text,text) from public,anon;
revoke all on function public.banking_category_transactions(text,text,text) from public,anon;
grant execute on function public.banking_analytics(text,text) to authenticated;
grant execute on function public.banking_category_transactions(text,text,text) to authenticated;
commit;
