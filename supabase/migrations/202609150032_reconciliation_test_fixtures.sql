-- Test uniquement (StripeQA Co) : vérifier en direct reconcile-stripe-payments
-- sur deux cas qui ne touchent jamais un paiement déjà 'succeeded' (le
-- trigger d'intégrité l'interdit à raison, vérifié en le heurtant) :
-- 1. Une session Stripe réelle jamais payée, vieillie artificiellement pour
--    dépasser le seuil de 15 minutes -> doit être ignorée (encore en cours).
-- 2. Une référence Stripe inexistante -> doit être ignorée proprement
--    (échec de recherche Stripe, pas d'exception).
begin;
update payment_transactions
set created_at = now() - interval '20 minutes'
where provider_reference = 'cs_test_a13U6BfF9vQt0MIcOUSXVyDZmLZUbj2r57POQwJbKdBuuchDTmZkGMrGDd';

insert into payment_transactions(
  client_id, company_id, plan_id, provider, provider_reference, operation_id,
  billing_cycle, amount, currency, status, created_at
)
select
  m.user_id, m.company_id, p.id, 'stripe', 'cs_test_does_not_exist_reconcile_fixture', gen_random_uuid(),
  'monthly', 120000, 'GNF', 'processing', now() - interval '20 minutes'
from memberships m, plans p
where m.company_id = (select company_id from companies where name = 'StripeQA Co')
  and p.name = 'Basic'
limit 1;
commit;
