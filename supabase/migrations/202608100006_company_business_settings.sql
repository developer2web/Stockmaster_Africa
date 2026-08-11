alter table public.companies
  add column if not exists phone text,
  add column if not exists email text,
  add column if not exists address text,
  add column if not exists logo_url text,
  add column if not exists language text not null default 'fr' check (language in ('fr','en')),
  add column if not exists tax_rate numeric(5,2) not null default 0 check (tax_rate between 0 and 100),
  add column if not exists allow_discounts boolean not null default false,
  add column if not exists allow_credit_sales boolean not null default true,
  add column if not exists low_stock_alerts boolean not null default true,
  add column if not exists receipt_footer text;
