-- Keep historical businesses valid while preventing new USA/Canada selection.
update public.country_currency_map
set is_active = false
where country_code in ('US', 'CA');
