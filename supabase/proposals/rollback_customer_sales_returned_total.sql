-- Rétablit get_customer_sales_safe sans returned_total.
begin;
create or replace function public.get_customer_sales_safe(p_company_id uuid, p_customer_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'reference',s.reference,'total',s.total,
    'payment_method',s.payment_method,'created_at',s.created_at,'store',jsonb_build_object('name',st.name)) order by s.created_at desc),'[]'::jsonb)
  from public.sales s join public.stores st on st.id=s.store_id
  where s.company_id=p_company_id and s.customer_id=p_customer_id and public.belongs_to_company(s.company_id)
    and public.can_access_store(s.company_id,s.store_id) and public.has_permission(s.company_id,'sales.read');
$function$;
commit;
