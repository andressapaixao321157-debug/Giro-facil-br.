-- Recursos profissionais do chat: último acesso e anexos privados por conversa.
create table if not exists public.chat_presencas (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_seen_at timestamptz not null default now()
);

alter table public.chat_presencas enable row level security;
grant select, insert, update on public.chat_presencas to authenticated;

drop policy if exists chat_presencas_select_participantes on public.chat_presencas;
create policy chat_presencas_select_participantes
on public.chat_presencas for select to authenticated
using (
  exists (
    select 1 from public.conversas c
    where (
      (c.comprador_id = (select auth.uid()) and c.vendedor_id = chat_presencas.user_id)
      or
      (c.vendedor_id = (select auth.uid()) and c.comprador_id = chat_presencas.user_id)
    )
  )
);

drop policy if exists chat_presencas_insert_propria on public.chat_presencas;
create policy chat_presencas_insert_propria
on public.chat_presencas for insert to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists chat_presencas_update_propria on public.chat_presencas;
create policy chat_presencas_update_propria
on public.chat_presencas for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-anexos', 'chat-anexos', false, 5242880, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update
set public = false, file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif'];

drop policy if exists chat_anexos_select_participantes on storage.objects;
create policy chat_anexos_select_participantes
on storage.objects for select to authenticated
using (
  bucket_id = 'chat-anexos'
  and exists (
    select 1 from public.conversas c
    where c.id::text = (storage.foldername(name))[1]
      and ((select auth.uid()) = c.comprador_id or (select auth.uid()) = c.vendedor_id)
  )
);

drop policy if exists chat_anexos_insert_proprio on storage.objects;
create policy chat_anexos_insert_proprio
on storage.objects for insert to authenticated
with check (
  bucket_id = 'chat-anexos'
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and exists (
    select 1 from public.conversas c
    where c.id::text = (storage.foldername(name))[1]
      and ((select auth.uid()) = c.comprador_id or (select auth.uid()) = c.vendedor_id)
  )
);

drop policy if exists chat_anexos_delete_proprio on storage.objects;
create policy chat_anexos_delete_proprio
on storage.objects for delete to authenticated
using (
  bucket_id = 'chat-anexos'
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and exists (
    select 1 from public.conversas c
    where c.id::text = (storage.foldername(name))[1]
      and ((select auth.uid()) = c.comprador_id or (select auth.uid()) = c.vendedor_id)
  )
);
