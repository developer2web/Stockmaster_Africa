-- Corrige les rapports employés après le passage de membership.store_id
-- à la table multi-boutiques membership_stores.
do $migration$
declare
  original_definition text;
  updated_definition text;
begin
  original_definition := pg_get_functiondef(
    'public.get_business_report_with_financials(date,date,uuid,uuid,uuid,uuid)'::regprocedure
  );

  updated_definition := regexp_replace(
    original_definition,
    'if not v_can_all_stores then\s+if v_member_store is null then raise exception ''Aucune boutique attribuée''; end if;\s+if p_store_id is not null and p_store_id<>v_member_store then raise exception ''Cette boutique ne vous est pas attribuée''; end if;\s+p_store_id:=v_member_store;\s+end if;',
    'if p_store_id is null then raise exception ''Sélectionnez une boutique pour afficher le rapport''; end if;
  if not public.can_access_store(v_company,p_store_id) then
    raise exception ''Cette boutique ne vous est pas attribuée'';
  end if;',
    'i'
  );

  if updated_definition = original_definition then
    raise exception 'Bloc d accès boutique du rapport introuvable';
  end if;

  execute updated_definition;
end
$migration$;
