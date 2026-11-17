-- Giro Fácil BR: permitir todos os tipos de pedido usados pela monetização.
-- A tabela antiga pode ter sido criada pelo setup inicial, que limitava kind a single/monthly.

alter table public.payment_orders
  drop constraint if exists payment_orders_kind_check;

alter table public.payment_orders
  add constraint payment_orders_kind_check
  check (kind in ('single', 'monthly', 'boost', 'store'));
