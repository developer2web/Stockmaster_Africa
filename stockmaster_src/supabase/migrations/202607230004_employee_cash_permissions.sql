-- Preserve the intent of existing roles after introducing explicit cash permissions.
insert into public.role_permissions(company_id,role_id,permission_id,created_by)
select rp.company_id,rp.role_id,cash_permission.id,rp.created_by
from public.role_permissions rp
join public.permissions previous_permission on previous_permission.id=rp.permission_id
join public.permissions cash_permission on cash_permission.code='cash_transactions.read'
where previous_permission.code='expenses.read'
on conflict(role_id,permission_id) do nothing;

insert into public.role_permissions(company_id,role_id,permission_id,created_by)
select rp.company_id,rp.role_id,cash_permission.id,rp.created_by
from public.role_permissions rp
join public.permissions previous_permission on previous_permission.id=rp.permission_id
join public.permissions cash_permission on cash_permission.code='cash_transactions.write'
where previous_permission.code='expenses.write'
on conflict(role_id,permission_id) do nothing;
