-- Let an employee open/reopen a register through explicit, auditable permissions.

insert into public.permissions(code, description) values
  ('cash.open', 'Ouvrir une caisse et valider son montant initial'),
  ('cash.reopen', 'Valider la reprise d’une caisse clôturée')
on conflict(code) do update set description = excluded.description;

-- Preserve the effective access of roles that already manage cash while making
-- the opening permissions visible and independently configurable afterwards.
insert into public.role_permissions(company_id, role_id, permission_id, created_by)
select source.company_id, source.role_id, target.id, source.created_by
from public.role_permissions source
join public.permissions existing on existing.id = source.permission_id
cross join public.permissions target
where existing.code = 'cash_transactions.write'
  and target.code in ('cash.open', 'cash.reopen')
on conflict(role_id, permission_id) do nothing;

create or replace function public.open_store_cash(
  p_store_id uuid,
  p_counted_amount numeric,
  p_note text default null
) returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_company uuid;
  v_closure public.cash_closures%rowtype;
  v_id uuid;
  v_label text;
  v_expected numeric := 0;
begin
  perform pg_advisory_xact_lock(hashtextextended('cash-open:' || p_store_id::text, 0));
  select company_id into v_company from public.stores where id = p_store_id and is_active;
  if v_company is null
     or not public.can_access_store(v_company, p_store_id)
     or not (
       public.is_company_admin(v_company)
       or public.has_permission(v_company, 'cash.open')
       or public.has_permission(v_company, 'cash_transactions.write')
     ) then
    raise exception 'La permission d’ouverture de caisse est requise';
  end if;
  if p_counted_amount is null or p_counted_amount < 0 then
    raise exception 'Le montant initial est invalide';
  end if;

  select * into v_closure
  from public.cash_closures
  where store_id = p_store_id
  order by created_at desc, id desc
  limit 1 for update;

  if v_closure.id is null then
    if exists(select 1 from public.cash_openings where store_id = p_store_id) then
      raise exception 'La caisse est déjà ouverte';
    end if;
  else
    if exists(select 1 from public.cash_openings where last_closure_id = v_closure.id) then
      raise exception 'Cette reprise de caisse a déjà été validée';
    end if;
    if not (
      public.is_company_admin(v_company)
      or public.has_permission(v_company, 'cash.reopen')
    ) then
      raise exception 'La permission de réouverture de caisse est requise';
    end if;
    v_expected := v_closure.counted_amount;
  end if;

  select case when r.code = 'company_admin'
      then 'Administrateur'
      else coalesce(nullif(trim(p.full_name), ''), 'Employé') end
  into v_label
  from public.memberships m
  join public.roles r on r.id = m.role_id
  join public.profiles p on p.id = m.user_id
  where m.user_id = auth.uid() and m.company_id = v_company and m.is_active
  order by case when r.code = 'company_admin' then 0 else 1 end
  limit 1;

  insert into public.cash_openings(
    company_id, store_id, last_closure_id, expected_amount, counted_amount,
    note, opened_by, opened_by_label
  ) values (
    v_company, p_store_id, v_closure.id, v_expected, p_counted_amount,
    nullif(trim(p_note), ''), auth.uid(), coalesce(v_label, 'Employé')
  ) returning id into v_id;

  insert into public.audit_logs(
    company_id, actor_id, action, entity_type, entity_id, payload, created_by
  ) values (
    v_company, auth.uid(),
    case when v_closure.id is null then 'open_cash' else 'reopen_cash' end,
    'cash_openings', v_id,
    jsonb_build_object(
      'closure_id', v_closure.id,
      'expected', v_expected,
      'counted', p_counted_amount,
      'difference', p_counted_amount - v_expected
    ),
    auth.uid()
  );
  return v_id;
end
$$;

grant execute on function public.open_store_cash(uuid,numeric,text) to authenticated;
revoke all on function public.open_store_cash(uuid,numeric,text) from anon;
