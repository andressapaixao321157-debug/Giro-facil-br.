-- Giro Fácil BR: índices de chaves estrangeiras e políticas RLS com initplan estável.
create index if not exists assistant_messages_user_id_idx
  on public.assistant_messages (user_id);
create index if not exists assistant_messages_thread_user_idx
  on public.assistant_messages (thread_id, user_id);
create index if not exists owner_agent_tasks_report_id_idx
  on public.owner_agent_tasks (report_id);
create index if not exists platform_settings_updated_by_idx
  on public.platform_settings (updated_by);

drop policy if exists "Owner admins read agent reports" on public.owner_agent_reports;
create policy "Owner admins read agent reports"
on public.owner_agent_reports
for select to authenticated
using (
  exists (
    select 1
    from public.perfis p
    where p.id = (select auth.uid())
      and p.papel = 'admin'
  )
);

drop policy if exists "Owner admins read agent tasks" on public.owner_agent_tasks;
create policy "Owner admins read agent tasks"
on public.owner_agent_tasks
for select to authenticated
using (
  exists (
    select 1
    from public.perfis p
    where p.id = (select auth.uid())
      and p.papel = 'admin'
  )
);
