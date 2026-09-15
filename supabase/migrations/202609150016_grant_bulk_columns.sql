begin;

-- Bug trouvé en testant la vente en gros/détail en direct : "Vous n'avez
-- pas l'autorisation d'effectuer cette action" en chargeant les produits.
-- Cause : 202609100001_security_privileges.sql accorde SELECT colonne par
-- colonne sur products/product_variants (tout sauf purchase_price), mais
-- calculé une seule fois ce jour-là — les 3 colonnes ajoutées aujourd'hui
-- (bulk_unit_label, bulk_quantity, bulk_price) n'y étaient pas encore et
-- restent donc invisibles pour authenticated tant qu'on ne relance pas ce
-- calcul. À RETENIR : toute future colonne ajoutée à products ou
-- product_variants doit être suivie de ce même recalcul, sinon elle reste
-- inaccessible malgré RLS.
do $$
declare v_table text; safe_columns text;
begin
  foreach v_table in array array['products','product_variants'] loop
    select string_agg(quote_ident(c.column_name), ',') into safe_columns
    from information_schema.columns c
    where c.table_schema='public' and c.table_name=v_table and c.column_name<>'purchase_price';
    execute format('grant select (%s) on public.%I to authenticated',safe_columns,v_table);
  end loop;
end $$;

notify pgrst,'reload schema';
commit;
