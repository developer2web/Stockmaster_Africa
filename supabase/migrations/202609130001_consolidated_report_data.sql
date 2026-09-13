-- get_business_report_with_financials still hard-rejects p_store_id is null
-- (added 202608100003, before "consolidated reports" existed as a feature),
-- even though its query body already fully supports a company-wide
-- aggregation (every CTE already does `p_store_id is null or ...=p_store_id`).
-- Allow the null case, but only for callers who can see all stores AND whose
-- plan includes consolidated_reports (mirrors the client-side FeatureGate and
-- the get_report_filters change in 202609120011).
do $migration$
declare
  original_definition text;
  updated_definition text;
begin
  original_definition := pg_get_functiondef(
    'public.get_business_report_with_financials(date,date,uuid,uuid,uuid,uuid)'::regprocedure
  );

  updated_definition := replace(
    original_definition,
    E'if p_store_id is null then raise exception \'Sélectionnez une boutique pour afficher le rapport\'; end if;\n  if not public.can_access_store(v_company,p_store_id) then\n    raise exception \'Cette boutique ne vous est pas attribuée\';\n  end if;',
    E'if p_store_id is null then\n    if not v_can_all_stores then raise exception \'Sélectionnez une boutique pour afficher le rapport\'; end if;\n    perform public.require_feature(v_company,\'consolidated_reports\');\n  else\n    if not public.can_access_store(v_company,p_store_id) then\n      raise exception \'Cette boutique ne vous est pas attribuée\';\n    end if;\n  end if;'
  );

  if updated_definition = original_definition then
    raise exception 'Bloc de garde p_store_id du rapport introuvable';
  end if;

  execute updated_definition;
end
$migration$;

notify pgrst, 'reload schema';
