-- StockMaster Phase 3 - categories, suppliers, products and variants

alter table public.categories add column if not exists description text;
alter table public.categories add column if not exists is_active boolean not null default true;
create unique index if not exists categories_company_name_unique on public.categories(company_id, lower(name));
alter table public.suppliers add column if not exists address text;
alter table public.suppliers add column if not exists is_active boolean not null default true;
create index if not exists suppliers_company_name_idx on public.suppliers(company_id, lower(name));
alter table public.products add column if not exists supplier_id uuid references public.suppliers(id) on delete set null;
alter table public.products add column if not exists description text;
alter table public.products add column if not exists low_stock_threshold numeric(14,3) not null default 5 check (low_stock_threshold >= 0);
alter table public.products add column if not exists is_active boolean not null default true;
alter table public.products add constraint products_prices_nonnegative check (purchase_price >= 0 and sale_price >= 0);
create unique index if not exists products_company_barcode_unique on public.products(company_id, barcode) where barcode is not null;
create index if not exists products_company_name_idx on public.products(company_id, lower(name));
alter table public.product_variants add column if not exists attributes jsonb not null default '{}';
alter table public.product_variants add column if not exists purchase_price numeric(12,2) check (purchase_price is null or purchase_price >= 0);
alter table public.product_variants add column if not exists sale_price numeric(12,2) check (sale_price is null or sale_price >= 0);
alter table public.product_variants add column if not exists is_active boolean not null default true;
insert into public.permissions(code, description) values
  ('categories.read', 'Consulter les catégories'),
  ('categories.write', 'Gérer les catégories'),
  ('suppliers.read', 'Consulter les fournisseurs'),
  ('suppliers.write', 'Gérer les fournisseurs'),
  ('product_variants.read', 'Consulter les variantes'),
  ('product_variants.write', 'Gérer les variantes')
on conflict (code) do update set description = excluded.description;
do $$ begin alter publication supabase_realtime add table public.categories; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.products; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.product_variants; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.suppliers; exception when duplicate_object then null; end $$;
