alter table public.app_error_events replica identity full;
do $$ begin
  alter publication supabase_realtime add table public.app_error_events;
exception when duplicate_object then null;
end $$;
