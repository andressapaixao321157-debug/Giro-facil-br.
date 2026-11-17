-- Giro Fácil BR: private in-app conversations between listing buyers and sellers.
create table if not exists public.conversas (
  id uuid primary key default gen_random_uuid(),
  anuncio_id uuid not null references public.anuncios(id) on delete cascade,
  comprador_id uuid not null references auth.users(id) on delete cascade,
  vendedor_id uuid not null references auth.users(id) on delete cascade,
  criada_em timestamptz not null default now(),
  ultima_mensagem_em timestamptz not null default now(),
  constraint conversas_nao_conversar_consigo check (comprador_id <> vendedor_id),
  constraint conversas_unicas_por_comprador unique (anuncio_id, comprador_id)
);

create table if not exists public.mensagens (
  id uuid primary key default gen_random_uuid(),
  conversa_id uuid not null references public.conversas(id) on delete cascade,
  remetente_id uuid not null references auth.users(id) on delete cascade,
  conteudo text not null check (char_length(trim(conteudo)) between 1 and 4000),
  criada_em timestamptz not null default now(),
  lida_em timestamptz
);

create index if not exists conversas_comprador_ultima_idx on public.conversas(comprador_id, ultima_mensagem_em desc);
create index if not exists conversas_vendedor_ultima_idx on public.conversas(vendedor_id, ultima_mensagem_em desc);
create index if not exists mensagens_conversa_data_idx on public.mensagens(conversa_id, criada_em);

alter table public.conversas enable row level security;
alter table public.mensagens enable row level security;

drop policy if exists conversas_participantes_select on public.conversas;
create policy conversas_participantes_select on public.conversas
for select to authenticated
using ((select auth.uid()) = comprador_id or (select auth.uid()) = vendedor_id);

drop policy if exists conversas_comprador_insert on public.conversas;
create policy conversas_comprador_insert on public.conversas
for insert to authenticated
with check (
  comprador_id = (select auth.uid())
  and vendedor_id <> (select auth.uid())
  and exists (
    select 1 from public.anuncios a
    where a.id = conversas.anuncio_id
      and a.usuario_id = conversas.vendedor_id
      and a.status = 'ativo'
  )
);

drop policy if exists mensagens_participantes_select on public.mensagens;
create policy mensagens_participantes_select on public.mensagens
for select to authenticated
using (exists (
  select 1 from public.conversas c
  where c.id = mensagens.conversa_id
    and ((select auth.uid()) = c.comprador_id or (select auth.uid()) = c.vendedor_id)
));

drop policy if exists mensagens_remetente_insert on public.mensagens;
create policy mensagens_remetente_insert on public.mensagens
for insert to authenticated
with check (
  remetente_id = (select auth.uid())
  and exists (
    select 1 from public.conversas c
    where c.id = mensagens.conversa_id
      and ((select auth.uid()) = c.comprador_id or (select auth.uid()) = c.vendedor_id)
  )
);
