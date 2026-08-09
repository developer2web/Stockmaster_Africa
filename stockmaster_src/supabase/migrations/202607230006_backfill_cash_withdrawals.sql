-- Convertit les anciennes sorties manuelles en dépenses comptables.
-- Le trigger crée leur nouveau mouvement lié, puis l'ancien mouvement est retiré :
-- le solde reste identique et la dépense entre dans le bénéfice net.
do $$
declare old_cash record;new_expense uuid;
begin
  for old_cash in
    select * from cash_transactions
    where transaction_type='withdrawal' and expense_id is null
  loop
    insert into expenses(company_id,store_id,label,amount,expense_date,created_by,created_at)
    values(
      old_cash.company_id,old_cash.store_id,old_cash.designation,old_cash.amount,
      old_cash.created_at::date,old_cash.created_by,old_cash.created_at
    )
    returning id into new_expense;
    delete from cash_transactions where id=old_cash.id;
  end loop;
end
$$;
