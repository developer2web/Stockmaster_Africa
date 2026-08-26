-- Per-store receipt identity. Empty values inherit company branding in the app.
alter table public.stores
  add column if not exists receipt_display_name text,
  add column if not exists receipt_address text,
  add column if not exists receipt_phone text,
  add column if not exists receipt_email text,
  add column if not exists receipt_logo_url text,
  add column if not exists receipt_footer text,
  add column if not exists receipt_accent_color text not null default '#084B50';

alter table public.stores
  drop constraint if exists stores_receipt_display_name_length,
  add constraint stores_receipt_display_name_length check (receipt_display_name is null or char_length(receipt_display_name) <= 100),
  drop constraint if exists stores_receipt_address_length,
  add constraint stores_receipt_address_length check (receipt_address is null or char_length(receipt_address) <= 250),
  drop constraint if exists stores_receipt_phone_length,
  add constraint stores_receipt_phone_length check (receipt_phone is null or char_length(receipt_phone) <= 40),
  drop constraint if exists stores_receipt_email_length,
  add constraint stores_receipt_email_length check (receipt_email is null or char_length(receipt_email) <= 160),
  drop constraint if exists stores_receipt_logo_url_length,
  add constraint stores_receipt_logo_url_length check (receipt_logo_url is null or char_length(receipt_logo_url) <= 500),
  drop constraint if exists stores_receipt_footer_length,
  add constraint stores_receipt_footer_length check (receipt_footer is null or char_length(receipt_footer) <= 300),
  drop constraint if exists stores_receipt_accent_color_format,
  add constraint stores_receipt_accent_color_format check (receipt_accent_color ~ '^#[0-9A-Fa-f]{6}$');

comment on column public.stores.receipt_display_name is 'Optional store name printed on receipts; null inherits the store name.';
comment on column public.stores.receipt_accent_color is 'Hex accent color used on this store receipts and PDF reports.';
