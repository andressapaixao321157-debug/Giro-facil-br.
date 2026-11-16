-- Giro Fácil BR: monetização compatível com as Edge Functions Asaas existentes.
-- Execute no Supabase SQL Editor. Segredos ficam somente em Supabase Secrets.

alter table public.perfis
  add column if not exists papel text not null default 'usuario'
    check (papel in ('usuario','admin')),
  add column if not exists asaas_customer_id text,
  add column if not exists plano_status text not null default 'inativo',
  add column if not exists plano_asaas_subscription_id text;

alter table public.anuncios
  add column if not exists pagamento_status text not null default 'aguardando'
    check (pagamento_status in ('aguardando','pago','plano','nao_pago'));

-- Estrutura usada pela função asaas-create-payment e pelo webhook já existentes.
create table if not exists public.payment_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  listing_id uuid references public.anuncios(id) on delete set null,
  kind text not null,
  billing_type text not null check (billing_type in ('PIX','BOLETO','CREDIT_CARD')),
  amount numeric(12,2) not null check (amount > 0),
  status text not null default 'CREATING',
  asaas_customer_id text,
  asaas_payment_id text unique,
  asaas_subscription_id text,
  payment_url text,
  boleto_url text,
  pix_copy_paste text,
  pix_encoded_image text,
  plan_code text,
  duration_days integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists payment_orders_user_created_idx on public.payment_orders(user_id,created_at desc);
create index if not exists payment_orders_status_idx on public.payment_orders(status,created_at desc);

create table if not exists public.asaas_webhook_events (
  id bigint generated always as identity primary key,
  event_id text not null unique,
  event_type text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.ad_boosts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.payment_orders(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  listing_id uuid not null references public.anuncios(id) on delete cascade,
  plan_code text not null,
  duration_days integer not null check (duration_days > 0),
  amount numeric(12,2) not null check (amount > 0),
  status text not null default 'awaiting_payment' check (status in ('awaiting_payment','active','expired','refunded','cancelled')),
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists ad_boosts_active_idx on public.ad_boosts(status,ends_at desc);

create table if not exists public.store_plans (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.payment_orders(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  store_name text not null,
  plan_code text not null,
  amount numeric(12,2) not null check (amount > 0),
  status text not null default 'awaiting_payment' check (status in ('awaiting_payment','active','expired','refunded','cancelled')),
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.payment_orders enable row level security;
alter table public.asaas_webhook_events enable row level security;
alter table public.ad_boosts enable row level security;
alter table public.store_plans enable row level security;

drop policy if exists payment_orders_owner_read on public.payment_orders;
create policy payment_orders_owner_read on public.payment_orders
for select to authenticated using (user_id = auth.uid());

drop policy if exists ad_boosts_public_active_read on public.ad_boosts;
create policy ad_boosts_public_active_read on public.ad_boosts
for select to anon, authenticated using (status = 'active' and ends_at > now());

drop policy if exists ad_boosts_owner_read on public.ad_boosts;
create policy ad_boosts_owner_read on public.ad_boosts
for select to authenticated using (user_id = auth.uid());

drop policy if exists store_plans_public_active_read on public.store_plans;
create policy store_plans_public_active_read on public.store_plans
for select to anon, authenticated using (status = 'active' and ends_at > now());

drop policy if exists store_plans_owner_read on public.store_plans;
create policy store_plans_owner_read on public.store_plans
for select to authenticated using (user_id = auth.uid());

-- Escritas e ativações de pagamento são exclusivas das Edge Functions com service_role.
-- Defina papel='admin' manualmente no perfil do proprietário após validar o UUID da conta.
