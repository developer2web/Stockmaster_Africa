-- Rétablit la référence longue (SM-AAAAMMJJ-XXXXXXXX) de 202609190002 dans create_sale.
-- Les ventes déjà numérotées V-xxxxx gardent leur numéro.
begin;
do $migration$
declare
  v_old constant text := $$v_reference:=public.next_sale_reference(v_company);$$;
  v_new constant text := $$v_reference:='SM-'||to_char(now(),'YYYYMMDD')||'-'||upper(substr(replace(v_sale::text,'-',''),1,8));$$;
  v_def text := pg_get_functiondef('public.create_sale(uuid,text,jsonb,uuid,uuid,timestamptz)'::regprocedure);
begin
  if position(v_old in v_def) = 0 then raise exception 'create_sale : ligne de référence courte introuvable'; end if;
  execute replace(v_def, v_old, v_new);
end
$migration$;
drop function if exists public.next_sale_reference(uuid);
drop table if exists public.sale_reference_counters;
commit;
