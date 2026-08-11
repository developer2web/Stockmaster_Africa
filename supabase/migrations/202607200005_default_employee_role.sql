-- Ensure every company has an assignable employee role.

create or replace function public.create_default_employee_role()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_role uuid;
begin
  insert into roles(company_id,name,code,created_by)
  values(new.id,'Employé','employee',new.created_by)
  returning id into v_role;

  insert into role_permissions(company_id,role_id,permission_id,created_by)
  select new.id,v_role,p.id,new.created_by from permissions p
  where p.code in ('products.read','categories.read','suppliers.read','stores.read');
  return new;
end $$;
drop trigger if exists create_default_employee_role on public.companies;
create trigger create_default_employee_role after insert on public.companies
for each row execute function public.create_default_employee_role();
do $$ declare company_record record; role_id uuid; begin
  for company_record in select c.id,c.created_by from companies c
    where not exists(select 1 from roles r where r.company_id=c.id and r.code='employee')
  loop
    insert into roles(company_id,name,code,created_by)
    values(company_record.id,'Employé','employee',company_record.created_by)
    returning id into role_id;

    insert into role_permissions(company_id,role_id,permission_id,created_by)
    select company_record.id,role_id,p.id,company_record.created_by from permissions p
    where p.code in ('products.read','categories.read','suppliers.read','stores.read');
  end loop;
end $$;
