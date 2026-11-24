-- Persistent private memory for the Giro Fácil BR assistant.
create table if not exists public.assistant_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Conversa com o assistente',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assistant_threads_id_user_unique unique (id, user_id)
);
create index if not exists assistant_threads_user_updated_idx
  on public.assistant_threads(user_id, updated_at desc);
create table if not exists public.assistant_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null check (char_length(trim(content)) between 1 and 4000),
  created_at timestamptz not null default now(),
  constraint assistant_messages_user_thread_fk foreign key (thread_id, user_id)
    references public.assistant_threads(id, user_id) on delete cascade
);
create index if not exists assistant_messages_thread_created_idx
  on public.assistant_messages(thread_id, created_at);
alter table public.assistant_threads enable row level security;
alter table public.assistant_messages enable row level security;
revoke all on public.assistant_threads from anon, authenticated;
revoke all on public.assistant_messages from anon, authenticated;
grant select, insert, update, delete on public.assistant_threads to authenticated;
grant select, insert, delete on public.assistant_messages to authenticated;
drop policy if exists assistant_threads_owner_all on public.assistant_threads;
create policy assistant_threads_owner_all on public.assistant_threads for all to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists assistant_messages_owner_select on public.assistant_messages;
create policy assistant_messages_owner_select on public.assistant_messages for select to authenticated
using ((select auth.uid()) = user_id and exists (
  select 1 from public.assistant_threads t where t.id = assistant_messages.thread_id and t.user_id = (select auth.uid())
));
drop policy if exists assistant_messages_owner_insert on public.assistant_messages;
create policy assistant_messages_owner_insert on public.assistant_messages for insert to authenticated
with check ((select auth.uid()) = user_id and exists (
  select 1 from public.assistant_threads t where t.id = assistant_messages.thread_id and t.user_id = (select auth.uid())
));
drop policy if exists assistant_messages_owner_delete on public.assistant_messages;
create policy assistant_messages_owner_delete on public.assistant_messages for delete to authenticated
using ((select auth.uid()) = user_id and exists (
  select 1 from public.assistant_threads t where t.id = assistant_messages.thread_id and t.user_id = (select auth.uid())
));
