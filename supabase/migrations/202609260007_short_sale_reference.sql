begin;

-- Demande du 26/09 : le numéro de reçu (SM-20260926-2D8747AB, 20 caractères)
-- est trop long. Les nouvelles ventes reçoivent un numéro court qui se suit
-- par entreprise : V-00164. Préfixe « V » (vente) pour ne pas confondre avec
-- l'identifiant hors ligne SM-12345. Les ventes existantes gardent leur
-- référence ; l'unicité (company_id, reference) reste assurée par
-- sales_company_reference_unique, les deux formats ne pouvant pas se croiser.

create table if not exists public.sale_reference_counters (
  company_id uuid primary key references public.companies(id) on delete cascade,
  last_value bigint not null check (last_value >= 0)
);
alter table public.sale_reference_counters enable row level security;
revoke all on public.sale_reference_counters from public, anon, authenticated;

-- La numérotation reprend après les ventes déjà faites (la 164e vente d'une
-- entreprise qui en compte 163 porte V-00164).
insert into public.sale_reference_counters(company_id, last_value)
select company_id, count(*) from public.sales group by company_id
on conflict (company_id) do nothing;

-- Incrément sous verrou de ligne (insert … on conflict do update) : deux ventes
-- simultanées de la même entreprise ne peuvent pas obtenir le même numéro.
create or replace function public.next_sale_reference(p_company_id uuid)
returns text
language sql
security definer
set search_path = public
as $$
  insert into public.sale_reference_counters as c(company_id, last_value)
  values (p_company_id, 1)
  on conflict (company_id) do update set last_value = c.last_value + 1
  returning 'V-' || lpad(c.last_value::text, 5, '0');
$$;
revoke all on function public.next_sale_reference(uuid) from public, anon, authenticated;

-- create_sale n'est modifiée que sur la ligne qui fabrique la référence : on
-- réécrit la définition en place, telle qu'elle existe en base, plutôt que de
-- recopier toute la fonction (aucun risque d'écraser une correction ultérieure).
do $migration$
declare
  v_old constant text := $$v_reference:='SM-'||to_char(now(),'YYYYMMDD')||'-'||upper(substr(replace(v_sale::text,'-',''),1,8));$$;
  v_new constant text := $$v_reference:=public.next_sale_reference(v_company);$$;
  v_oid regprocedure := 'public.create_sale(uuid,text,jsonb,uuid,uuid,timestamptz)'::regprocedure;
  v_def text := pg_get_functiondef(v_oid);
begin
  if position(v_old in v_def) = 0 then
    raise exception 'create_sale : ligne de référence introuvable, migration à revoir';
  end if;
  execute replace(v_def, v_old, v_new);
end
$migration$;

commit;
