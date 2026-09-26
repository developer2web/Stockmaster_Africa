-- Rétablit get_sale_detail_safe de 202608210003 (sans unit/has_homonym).
begin;
create or replace function public.get_sale_detail_safe(p_sale_id uuid)
returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object(
    'id',s.id,'company_id',s.company_id,'store_id',s.store_id,'customer_id',s.customer_id,
    'reference',s.reference,'subtotal',s.subtotal,'discount_total',s.discount_total,
    'tax_rate_snapshot',s.tax_rate_snapshot,'tax_total',s.tax_total,'total',s.total,
    'amount_paid',s.amount_paid,'amount_due',s.amount_due,'payment_status',s.payment_status,
    'currency_code',s.currency_code,'secondary_currency_code',s.secondary_currency_code,
    'secondary_exchange_rate',s.secondary_exchange_rate,'exchange_rate_effective_at',s.exchange_rate_effective_at,
    'payment_method',s.payment_method,'created_by',s.created_by,'created_at',s.created_at,
    'store',case when st.id is null then null else jsonb_build_object('name',st.name) end,
    'creator',case when pr.id is null then null else jsonb_build_object('full_name',pr.full_name) end,
    'customer',case when c.id is null then null else jsonb_build_object('name',c.name,'phone',c.phone,'email',c.email) end,
    'sale_items',coalesce((select jsonb_agg(jsonb_build_object(
      'id',si.id,'sale_id',si.sale_id,'product_id',si.product_id,'product_variant_id',si.product_variant_id,
      'sale_price',si.sale_price,'quantity',si.quantity,'discount',si.discount,'line_total',si.line_total,
      'tax_rate_snapshot',si.tax_rate_snapshot,'tax_amount',si.tax_amount,
      'product',jsonb_build_object('name',p.name,'sku',p.sku),
      'variant',case when pv.id is null then null else jsonb_build_object('name',pv.name,'sku',pv.sku) end
    ) order by si.created_at) from public.sale_items si join public.products p on p.id=si.product_id
      left join public.product_variants pv on pv.id=si.product_variant_id where si.sale_id=s.id),'[]'::jsonb)
  )
  from public.sales s left join public.stores st on st.id=s.store_id
  left join public.profiles pr on pr.id=s.created_by left join public.customers c on c.id=s.customer_id
  where s.id=p_sale_id and public.belongs_to_company(s.company_id)
    and public.can_access_store(s.company_id,s.store_id) and public.has_permission(s.company_id,'sales.read');
$$;
grant execute on function public.get_sale_detail_safe(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
