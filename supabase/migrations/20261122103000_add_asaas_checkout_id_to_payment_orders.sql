alter table public.payment_orders add column if not exists asaas_checkout_id text;
create index if not exists payment_orders_asaas_checkout_id_idx on public.payment_orders (asaas_checkout_id) where asaas_checkout_id is not null;
