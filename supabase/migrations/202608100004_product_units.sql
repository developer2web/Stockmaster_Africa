alter table public.products
  add column if not exists unit text not null default 'piece'
  check (unit in ('piece', 'carton', 'kg', 'litre', 'sac', 'paquet'));

comment on column public.products.unit is 'Unité de vente et de stock affichée dans StockMaster';
