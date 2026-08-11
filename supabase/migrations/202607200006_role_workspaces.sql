-- Default accountant role and role-aware session context.

insert into permissions(code,description) values
 ('payments.read','Consulter les paiements'),('expenses.read','Consulter les dépenses'),
 ('expenses.write','Gérer les dépenses'),('purchases.read','Consulter les achats'),
 ('daily_reports.read','Consulter les rapports journaliers'),('monthly_reports.read','Consulter les rapports mensuels')
on conflict(code) do update set description=excluded.description;
create or replace function public.create_default_employee_role()
returns trigger language plpgsql security definer set search_path=public as $$
declare employee_role uuid; accountant_role uuid;
begin
 insert into roles(company_id,name,code,created_by) values(new.id,'Employé','employee',new.created_by) returning id into employee_role;
 insert into role_permissions(company_id,role_id,permission_id,created_by)
 select new.id,employee_role,p.id,new.created_by from permissions p where p.code in ('products.read','categories.read','suppliers.read','stores.read');
 insert into roles(company_id,name,code,created_by) values(new.id,'Comptable','employee',new.created_by) returning id into accountant_role;
 insert into role_permissions(company_id,role_id,permission_id,created_by)
 select new.id,accountant_role,p.id,new.created_by from permissions p where p.code in ('sales.read','purchases.read','payments.read','expenses.read','expenses.write','daily_reports.read','monthly_reports.read');
 return new;
end $$;
do $$ declare c record; accountant_role uuid; begin
 for c in select id,created_by from companies loop
  if not exists(select 1 from roles where company_id=c.id and lower(name)=lower('Comptable')) then
   insert into roles(company_id,name,code,created_by) values(c.id,'Comptable','employee',c.created_by) returning id into accountant_role;
   insert into role_permissions(company_id,role_id,permission_id,created_by)
   select c.id,accountant_role,p.id,c.created_by from permissions p where p.code in ('sales.read','purchases.read','payments.read','expenses.read','expenses.write','daily_reports.read','monthly_reports.read');
  end if;
 end loop;
end $$;
drop function if exists public.get_my_context();
create function public.get_my_context()
returns table(membership_id uuid,company_id uuid,company_name text,store_id uuid,role app_role,role_name text,permissions text[],subscription_status subscription_status)
language sql stable security definer set search_path=public as $$
 select null::uuid,null::uuid,'Plateforme StockMaster'::text,null::uuid,'super_admin'::app_role,'Super Administrateur'::text,array[]::text[],null::subscription_status where public.is_super_admin()
 union all
 select m.id,m.company_id,c.name,m.store_id,r.code,r.name,coalesce(array_agg(p.code) filter(where p.code is not null),array[]::text[]),s.status
 from memberships m join companies c on c.id=m.company_id join roles r on r.id=m.role_id
 left join role_permissions rp on rp.role_id=r.id left join permissions p on p.id=rp.permission_id
 left join lateral(select status from subscriptions where company_id=m.company_id order by created_at desc limit 1)s on true
 where m.user_id=auth.uid() and m.is_active and not public.is_super_admin()
 group by m.id,c.name,r.code,r.name,s.status limit 1
$$;
grant execute on function public.get_my_context() to authenticated;
