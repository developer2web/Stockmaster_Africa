begin;

-- Nouveau tarif du forfait Business (code interne "premium") : 450 000 GNF/mois
-- au lieu de 600 000. Le prix annuel suit le même rapport que les autres
-- forfaits (10x le mensuel, soit l'équivalent de 2 mois offerts) : 4 500 000.
-- plans et plan_currency_prices sont la seule source de vérité, lue par
-- company_subscription_plans() (app), list_public_plans() (site public) et
-- subscription_quote() (paiement, y compris le montant envoyé à Stripe, qui
-- est calculé à la volée depuis ce même prix) — un seul changement suffit.
update public.plans
set monthly_price = 450000, annual_price = 4500000
where code = 'premium';

update public.plan_currency_prices pp
set monthly_price = 450000, annual_price = 4500000, updated_at = now()
from public.plans p
where pp.plan_id = p.id and p.code = 'premium' and pp.currency = 'GNF';

commit;
