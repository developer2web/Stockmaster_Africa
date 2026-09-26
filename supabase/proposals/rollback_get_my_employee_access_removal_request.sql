begin;
revoke all on function public.get_my_employee_access_removal_request(uuid) from authenticated;
drop function if exists public.get_my_employee_access_removal_request(uuid);
notify pgrst,'reload schema';
commit;
