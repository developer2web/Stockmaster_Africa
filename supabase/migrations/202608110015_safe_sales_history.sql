-- Sale history exposed without cost/profit columns, compatible with PostgREST.
create or replace function public.get_sales_history_safe(
  p_company_id uuid, p_store_id uuid, p_offset integer default 0, p_limit integer default 30
) returns jsonb language sql stable security definer set search_path=public as $$
  select coalesce(jsonb_agg(row_data order by created_at desc),'[]'::jsonb)
  from (
    select s.created_at, jsonb_build_object(
      'id',s.id,'company_id',s.company_id,'store_id',s.store_id,'customer_id',s.customer_id,
      'reference',s.reference,'subtotal',s.subtotal,'discount_total',s.discount_total,
      'total',s.total,'amount_paid',s.amount_paid,'amount_due',s.amount_due,
      'payment_status',s.payment_status,'currency_code',s.currency_code,
      'secondary_currency_code',s.secondary_currency_code,
      'secondary_exchange_rate',s.secondary_exchange_rate,
      'exchange_rate_effective_at',s.exchange_rate_effective_at,
      'payment_method',s.payment_method,'created_by',s.created_by,'created_at',s.created_at,
      'store',jsonb_build_object('name',st.name),
      'creator',case when pr.id is null then null else jsonb_build_object('full_name',pr.full_name) end
    ) row_data
    from public.sales s join public.stores st on st.id=s.store_id
    left join public.profiles pr on pr.id=s.created_by
    where s.company_id=p_company_id and s.store_id=p_store_id
      and public.belongs_to_company(s.company_id)
      and public.can_access_store(s.company_id,s.store_id)
      and public.has_permission(s.company_id,'sales.read')
    order by s.created_at desc offset greatest(coalesce(p_offset,0),0)
    limit least(greatest(coalesce(p_limit,30),1),100)
  ) rows;
$$;

grant execute on function public.get_sales_history_safe(uuid,uuid,integer,integer) to authenticated;
revoke all on function public.get_sales_history_safe(uuid,uuid,integer,integer) from anon;
