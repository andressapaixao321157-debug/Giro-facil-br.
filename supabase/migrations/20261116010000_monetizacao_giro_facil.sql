-- Giro Fácil BR: monetização, turbinamento, lojas e administração
-- Execute no Supabase SQL Editor. Não coloque service_role no navegador.

alter table public.perfis
  add column if not exists papel text not null default 'usuario'
  check (papel in ('usuario','admin'));

create table if not exists public.pedidos_pagamento (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id) on delete cascade,
  anuncio_id uuid references public.anuncios(id) on delete set null,
  tipo text not null check (tipo in ('anuncio_avulso','plano_mensal','turbinamento','loja')),
  plano_codigo text,
  valor numeric(12,2) not null check (valor > 0),
  status text not null default 'aguardando' check (status in ('aguardando','pago','vencido','cancelado','estornado','falhou')),
  asaas_payment_id text unique,
  asaas_customer_id text,
  billing_type text check (billing_type in ('PIX','BOLETO','CREDIT_CARD')),
  checkout_url text,
  pago_em timestamptz,
  criado_em timestamptz not null default now()
);
create index if not exists pedidos_pagamento_usuario_idx on public.pedidos_pagamento(usuario_id, criado_em desc);
create index if not exists pedidos_pagamento_status_idx on public.pedidos_pagamento(status, criado_em desc);

create table if not exists public.destaques (
  id uuid primary key default gen_random_uuid(),
  anuncio_id uuid not null references public.anuncios(id) on delete cascade,
  usuario_id uuid not null references auth.users(id) on delete cascade,
  pedido_id uuid unique references public.pedidos_pagamento(id) on delete set null,
  plano_codigo text not null,
  valor numeric(12,2) not null check (valor > 0),
  inicio_em timestamptz,
  termina_em timestamptz not null,
  status text not null default 'aguardando' check (status in ('aguardando','ativo','encerrado','cancelado')),
  criado_em timestamptz not null default now()
);
create index if not exists destaques_ativos_idx on public.destaques(status, termina_em desc);

create table if not exists public.lojas (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id) on delete cascade,
  nome text not null,
  plano_codigo text not null,
  status text not null default 'aguardando' check (status in ('aguardando','ativa','suspensa','cancelada')),
  inicio_em timestamptz,
  termina_em timestamptz,
  pedido_id uuid unique references public.pedidos_pagamento(id) on delete set null,
  criado_em timestamptz not null default now()
);
create index if not exists lojas_usuario_idx on public.lojas(usuario_id);

alter table public.pedidos_pagamento enable row level security;
alter table public.destaques enable row level security;
alter table public.lojas enable row level security;

drop policy if exists pedidos_owner_read on public.pedidos_pagamento;
create policy pedidos_owner_read on public.pedidos_pagamento
for select to authenticated using (usuario_id = auth.uid());

drop policy if exists destaques_public_active_read on public.destaques;
create policy destaques_public_active_read on public.destaques
for select to anon, authenticated using (status = 'ativo' and termina_em > now());

drop policy if exists destaques_owner_read on public.destaques;
create policy destaques_owner_read on public.destaques
for select to authenticated using (usuario_id = auth.uid());

drop policy if exists lojas_public_active_read on public.lojas;
create policy lojas_public_active_read on public.lojas
for select to anon, authenticated using (status = 'ativa');

drop policy if exists lojas_owner_read on public.lojas;
create policy lojas_owner_read on public.lojas
for select to authenticated using (usuario_id = auth.uid());

-- Não criar políticas de escrita para estas tabelas no navegador.
-- A criação e ativação de cobranças deve ocorrer exclusivamente em Edge Functions
-- usando segredos do Supabase e confirmação assinada/verificada do webhook Asaas.
