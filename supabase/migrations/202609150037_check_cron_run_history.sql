-- Diagnostic Super Admin, lecture seule : historique d'exécution d'une tâche
-- cron par son nom (cron.job_run_details), sans jamais exposer de secret.
create or replace function public.super_admin_cron_run_history(p_jobname text, p_limit int default 5)
returns table(status text, return_message text, start_time timestamptz, end_time timestamptz)
language plpgsql stable security definer set search_path = public, cron as $$
begin
  if not public.is_super_admin() then raise exception 'Accès Super Admin requis'; end if;
  return query
  select d.status, d.return_message, d.start_time, d.end_time
  from cron.job_run_details d
  join cron.job j on j.jobid = d.jobid
  where j.jobname = p_jobname
  order by d.start_time desc
  limit least(greatest(coalesce(p_limit,5),1),50);
end;
$$;
revoke all on function public.super_admin_cron_run_history(text,int) from public, anon, authenticated;
grant execute on function public.super_admin_cron_run_history(text,int) to authenticated;
