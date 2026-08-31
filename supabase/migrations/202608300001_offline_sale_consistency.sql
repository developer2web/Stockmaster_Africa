-- Refuse an offline sale when catalog prices or the tax-derived total changed
-- before synchronization. Raising here rolls back the nested sale atomically.
create or replace function public.create_sale_v3(
  p_store_id uuid,p_payment_method text,p_items jsonb,p_customer_id uuid default null,
  p_amount_paid numeric default null,p_operation_id uuid default gen_random_uuid(),
  p_offline_created_at timestamptz default null,p_offline_device_id text default null
) returns table(sale_id uuid,reference text,total numeric,gross_profit numeric,amount_paid numeric,amount_due numeric,payment_status text)
language plpgsql security definer set search_path=public as $$
declare result record;v_price_changed boolean:=false;v_expected_total numeric;
begin
  if p_offline_created_at is not null then
    if length(trim(coalesce(p_offline_device_id,'')))<8 then raise exception 'Identifiant de l’appareil hors ligne invalide';end if;
    if p_offline_created_at>now()+interval '5 minutes' then raise exception 'L’heure de l’appareil est invalide';end if;
    if p_offline_created_at<now()-interval '7 days' then raise exception 'Reconnexion requise : cette opération hors ligne date de plus de 7 jours';end if;
  end if;

  select * into result from public.create_sale_v2(p_store_id,p_payment_method,p_items,p_customer_id,p_amount_paid,p_operation_id);

  if p_offline_created_at is not null then
    select exists(
      select 1
      from jsonb_array_elements(p_items) item
      join public.sale_items si on si.sale_id=result.sale_id
        and si.product_id=(item->>'productId')::uuid
        and si.product_variant_id is not distinct from nullif(item->>'variantId','')::uuid
      where item ? 'unitPrice'
        and abs(si.sale_price-(item->>'unitPrice')::numeric)>0.005
    ) into v_price_changed;
    if v_price_changed then
      raise exception 'Conflit de prix : un article a changé depuis la vente hors ligne. Vérifiez puis recréez cette vente';
    end if;
    if (p_items->0) ? 'expectedTotal' then
      v_expected_total:=(p_items->0->>'expectedTotal')::numeric;
      if abs(result.total-v_expected_total)>0.01 then
        raise exception 'Conflit de total : les prix ou taxes ont changé depuis la vente hors ligne. Vérifiez puis recréez cette vente';
      end if;
    end if;
  end if;

  update public.sales set offline_created_at=p_offline_created_at,
    offline_device_id=case when p_offline_created_at is null then null else trim(p_offline_device_id) end,
    synced_at=case when p_offline_created_at is null then null else now() end
  where id=result.sale_id and (offline_created_at is null or offline_created_at=p_offline_created_at);
  if p_offline_created_at is not null and not found then raise exception 'Conflit de synchronisation détecté pour cette opération';end if;
  sale_id:=result.sale_id;reference:=result.reference;total:=result.total;gross_profit:=result.gross_profit;
  amount_paid:=result.amount_paid;amount_due:=result.amount_due;payment_status:=result.payment_status;return next;
end $$;

grant execute on function public.create_sale_v3(uuid,text,jsonb,uuid,numeric,uuid,timestamptz,text) to authenticated;
revoke all on function public.create_sale_v3(uuid,text,jsonb,uuid,numeric,uuid,timestamptz,text) from anon;
