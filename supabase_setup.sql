-- Giro Fácil BR: setup seguro e repetível
-- Execute no Supabase > SQL Editor. Não use service_role no site.

create table if not exists public.perfis (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null,
  criado_em timestamptz not null default now()
);

create table if not exists public.anuncios (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id) on delete cascade,
  titulo text not null,
  categoria text not null check (categoria in (
    'Carro', 'Moto', 'Caminhão', 'Imóvel para venda', 'Imóvel para aluguel'
  )),
  marca text,
  modelo text,
  ano integer,
  preco numeric(14,2) not null check (preco >= 0),
  descricao text,
  cidade text,
  estado text,
  fotos text[] not null default '{}',
  whatsapp text,
  status text not null default 'pendente' check (status in ('pendente','ativo','reprovado')),
  criado_em timestamptz not null default now()
);

create index if not exists anuncios_status_criado_idx
  on public.anuncios (status, criado_em desc);
create index if not exists anuncios_usuario_idx
  on public.anuncios (usuario_id);

alter table public.perfis enable row level security;
alter table public.anuncios enable row level security;

-- Perfil criado automaticamente mesmo quando o usuário precisa confirmar o e-mail.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.perfis (id, nome)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data->>'nome', ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Usuário'
    )
  )
  on conflict (id) do update set nome = excluded.nome;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Políticas de perfil: cada usuário acessa e altera somente o próprio perfil.
drop policy if exists "Usuário lê próprio perfil" on public.perfis;
create policy "Usuário lê próprio perfil"
on public.perfis for select to authenticated
using (id = auth.uid());

drop policy if exists "Usuário cria próprio perfil" on public.perfis;
create policy "Usuário cria próprio perfil"
on public.perfis for insert to authenticated
with check (id = auth.uid());

drop policy if exists "Usuário atualiza próprio perfil" on public.perfis;
create policy "Usuário atualiza próprio perfil"
on public.perfis for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

-- Remove as políticas antigas/duplicadas de anúncios antes de criar o conjunto mínimo.
do $$
declare p record;
begin
  for p in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'anuncios'
  loop
    execute format('drop policy %I on public.anuncios', p.policyname);
  end loop;
end
$$;

-- Visitantes veem somente anúncios aprovados/ativos.
create policy "anuncios_public_read_active"
on public.anuncios for select to anon, authenticated
using (status = 'ativo');

-- O anunciante autenticado também consegue ver os próprios anúncios pendentes/reprovados.
create policy "anuncios_owner_read_all"
on public.anuncios for select to authenticated
using (usuario_id = auth.uid());

-- Somente usuário autenticado pode inserir anúncio próprio, sempre como pendente.
create policy "anuncios_authenticated_insert_pending"
on public.anuncios for insert to authenticated
with check (usuario_id = auth.uid() and status = 'pendente');

-- O usuário pode remover somente anúncios que pertencem a ele.
create policy "anuncios_owner_delete"
on public.anuncios for delete to authenticated
using (usuario_id = auth.uid());

-- Bucket público para leitura das fotos; envio fica restrito à pasta do usuário.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'anuncios-fotos',
  'anuncios-fotos',
  true,
  5242880,
  array['image/jpeg','image/png','image/webp','image/gif']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "anuncios_fotos_public_read" on storage.objects;
create policy "anuncios_fotos_public_read"
on storage.objects for select to public
using (bucket_id = 'anuncios-fotos');

drop policy if exists "anuncios_fotos_owner_upload" on storage.objects;
create policy "anuncios_fotos_owner_upload"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'anuncios-fotos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "anuncios_fotos_owner_delete" on storage.objects;
create policy "anuncios_fotos_owner_delete"
on storage.objects for delete to authenticated
using (
  bucket_id = 'anuncios-fotos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "anuncios_fotos_owner_update" on storage.objects;
create policy "anuncios_fotos_owner_update"
on storage.objects for update to authenticated
using (
  bucket_id = 'anuncios-fotos'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'anuncios-fotos'
  and (storage.foldername(name))[1] = auth.uid()::text
);
