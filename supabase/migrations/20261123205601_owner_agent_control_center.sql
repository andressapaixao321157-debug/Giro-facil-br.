create table if not exists public.owner_agent_reports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  run_key text unique,
  overall_status text not null default 'operacional' check (overall_status in ('operacional','atencao','bloqueado')),
  headline text not null,
  summary text not null,
  metrics jsonb not null default '{}'::jsonb,
  completed_items jsonb not null default '[]'::jsonb,
  pending_items jsonb not null default '[]'::jsonb,
  approvals_needed jsonb not null default '[]'::jsonb,
  evidence jsonb not null default '[]'::jsonb
);

create table if not exists public.owner_agent_tasks (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  agent_key text not null check (agent_key in ('chefe','vigia','vendedor','tecnico','parceiro','captador_1','captador_2')),
  title text not null,
  description text not null default '',
  status text not null default 'pendente' check (status in ('pendente','em_andamento','aguardando_proprietario','concluida','bloqueada')),
  priority text not null default 'media' check (priority in ('baixa','media','alta','critica')),
  evidence jsonb not null default '[]'::jsonb,
  report_id uuid references public.owner_agent_reports(id) on delete set null
);

create index if not exists owner_agent_reports_created_at_idx on public.owner_agent_reports (created_at desc);
create index if not exists owner_agent_tasks_status_priority_idx on public.owner_agent_tasks (status, priority, updated_at desc);
create index if not exists owner_agent_tasks_agent_idx on public.owner_agent_tasks (agent_key, updated_at desc);

alter table public.owner_agent_reports enable row level security;
alter table public.owner_agent_tasks enable row level security;

drop policy if exists "Owner admins read agent reports" on public.owner_agent_reports;
create policy "Owner admins read agent reports" on public.owner_agent_reports
for select to authenticated
using (exists (select 1 from public.perfis p where p.id = auth.uid() and p.papel = 'admin'));

drop policy if exists "Owner admins read agent tasks" on public.owner_agent_tasks;
create policy "Owner admins read agent tasks" on public.owner_agent_tasks
for select to authenticated
using (exists (select 1 from public.perfis p where p.id = auth.uid() and p.papel = 'admin'));

revoke all on public.owner_agent_reports from anon, authenticated;
revoke all on public.owner_agent_tasks from anon, authenticated;
grant select on public.owner_agent_reports to authenticated;
grant select on public.owner_agent_tasks to authenticated;
