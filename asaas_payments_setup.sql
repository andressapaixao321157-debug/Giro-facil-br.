-- Giro Fácil BR: tabelas para integração Asaas.
-- Execute no Supabase SQL Editor uma única vez.

alter table public.perfis
  add column if not exists asaas_customer_id text,
  add column if not exists plano_status text not null default 'inativo',
  add column if not exists plano_asaas_subscription_id text;

alter table public.anuncios
  add column if not exists pagamento_status text not null default 'nao_pago';

create table if not exists public.payment_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  listing_id bigint references public.anuncios(id) on delete set null,
  kind text not null check (kind in ('single','monthly')),
  billing_type text not null check (billing_type in ('PIX','BOLETO')),
  amount numeric(12,2) not null check (amount > 0),
  status text not null default 'CREATING',
  asaas_customer_id text,
  asaas_payment_id text,
  asaas_subscription_id text,
  payment_url text,
  boleto_url text,
  pix_copy_paste text,
  pix_encoded_image text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists payment_orders_user_created_idx
  on public.payment_orders(user_id, created_at desc);
create unique index if not exists payment_orders_asaas_payment_uidx
  on public.payment_orders(asaas_payment_id) where asaas_payment_id is not null;

alter table public.payment_orders enable row level security;
drop policy if exists "users_read_own_payment_orders" on public.payment_orders;
create policy "users_read_own_payment_orders"
  on public.payment_orders for select to authenticated
  using (user_id = auth.uid());

create table if not exists public.asaas_webhook_events (
  event_id text primary key,
  event_type text not null,
  payload jsonb not null,
  received_at timestamptz not null default now()
);
alter table public.asaas_webhook_events enable row level security;
-- Sem políticas para anon/authenticated: somente service_role acessa esta tabela.
