-- Company administrators may review their own append-only activity history.
drop policy if exists audit_logs_company_admin_read on public.audit_logs;
create policy audit_logs_company_admin_read on public.audit_logs
for select to authenticated
using (public.is_company_admin(company_id));