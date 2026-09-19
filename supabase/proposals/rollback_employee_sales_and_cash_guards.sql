-- Annulation de 202609190001_employee_sales_and_cash_guards.sql (à exécuter dans l'éditeur SQL
-- Supabase si besoin ; ne fait pas partie des migrations). Ne touche à aucune donnée.
begin;
drop trigger if exists guard_zero_total_sale on public.sales;
drop function if exists public.guard_zero_total_sale();
drop trigger if exists guard_cash_transaction_amount on public.cash_transactions;
drop function if exists public.guard_cash_transaction_amount();
alter table public.companies alter column max_discount_percent set default 100;
commit;
