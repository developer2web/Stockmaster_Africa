begin;

-- record_stock_movement() garantit qu'une ligne stock_levels existe avant de la
-- verrouiller : elle l'insère d'abord à quantité 0 (insert ... on conflict do
-- nothing), puis la met à jour dans la même transaction avec la vraie quantité.
-- Ce 0 n'est jamais un état réel : le trigger de stock faible le voyait quand
-- même sur cet insert transitoire et envoyait une fausse alerte « stock à 0 »
-- à la création de chaque nouveau produit avec un stock initial, avant même
-- que la vraie quantité soit appliquée. Un insert direct à quantité 0 n'est
-- jamais non plus un état réel ailleurs (achats, transferts, retours et
-- inventaire exigent tous une quantité strictement positive) : ignorer ce cas
-- précis ne masque aucune alerte légitime.
create or replace function public.notify_low_stock_crossing()
returns trigger language plpgsql security definer set search_path='' as $$
declare threshold numeric; product_name text; store_name text; notification_title text; notification_body text;
begin
  select p.low_stock_threshold,p.name,s.name into threshold,product_name,store_name
  from public.products p join public.stores s on s.id=new.store_id and s.company_id=new.company_id
  join public.companies c on c.id=s.company_id and c.is_active and c.plan_archived_at is null
  where p.id=new.product_id and p.company_id=new.company_id and p.store_id=new.store_id and s.is_active;
  if threshold is null or new.quantity>threshold then return new;end if;
  if tg_op='INSERT' and new.quantity=0 then return new;end if;
  if tg_op='UPDATE' and old.quantity<=threshold then return new;end if;
  notification_title:='Stock faible : '||coalesce(product_name,'Produit');
  notification_body:=coalesce(store_name,'Boutique')||' · stock actuel : '||new.quantity||' · seuil : '||threshold;
  insert into public.notifications(company_id,store_id,user_id,title,body,type,created_by)
  values(new.company_id,new.store_id,null,notification_title,notification_body,'low_stock',new.created_by);

  insert into public.notifications(company_id,store_id,user_id,title,body,type,created_by,email_enabled)
  select distinct new.company_id,new.store_id,m.user_id,notification_title,notification_body,'low_stock',new.created_by,false
  from public.memberships m join public.roles r on r.id=m.role_id and r.company_id=m.company_id
  where m.company_id=new.company_id and m.is_active and r.code='employee'
    and (m.all_stores or m.store_id=new.store_id or exists(
      select 1 from public.membership_stores ms where ms.membership_id=m.id and ms.company_id=new.company_id and ms.store_id=new.store_id))
    and exists(select 1 from public.role_permissions rp join public.permissions p on p.id=rp.permission_id
      where rp.role_id=r.id and p.code='notifications.read')
    and exists(select 1 from public.role_permissions rp join public.permissions p on p.id=rp.permission_id
      where rp.role_id=r.id and p.code in ('stock_movements.read','stock_movements.write'));
  return new;
end $$;

notify pgrst,'reload schema';
commit;
