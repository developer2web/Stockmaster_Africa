begin;
revoke all on function public.request_employee_access_removal(uuid,text) from authenticated;
drop function if exists public.request_employee_access_removal(uuid,text);
notify pgrst,'reload schema';
commit;
