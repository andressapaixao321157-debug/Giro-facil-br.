create table if not exists public.partner_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  business_name text not null check (char_length(trim(business_name)) between 2 and 120),
  business_type text not null check (business_type in ('concessionaria','imobiliaria','loja','agro','outro')),
  contact_name text not null check (char_length(trim(contact_name)) between 2 and 120),
  phone text not null check (char_length(regexp_replace(phone, '[^0-9]', '', 'g')) between 10 and 13),
  city text not null,
  state text not null,
  status text not null default 'pendente' check (status in ('pendente','aprovado','rejeitado')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id)
);
create index if not exists partner_applications_status_created_idx on public.partner_applications(status, created_at desc);
create index if not exists partner_applications_user_idx on public.partner_applications(user_id);

create table if not exists public.partner_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  application_id uuid not null unique references public.partner_applications(id) on delete restrict,
  business_name text not null,
  business_type text not null,
  status text not null default 'ativo' check (status in ('ativo','suspenso')),
  approved_at timestamptz not null default now(),
  approved_by uuid references auth.users(id)
);

alter table public.partner_applications enable row level security;
alter table public.partner_accounts enable row level security;

grant select, insert on public.partner_applications to authenticated;
grant select on public.partner_accounts to authenticated;

drop policy if exists partner_application_insert_self on public.partner_applications;
create policy partner_application_insert_self on public.partner_applications
for insert to authenticated with check ((select auth.uid()) = user_id and status = 'pendente');

drop policy if exists partner_application_read_self on public.partner_applications;
create policy partner_application_read_self on public.partner_applications
for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists partner_account_read_self on public.partner_accounts;
create policy partner_account_read_self on public.partner_accounts
for select to authenticated using ((select auth.uid()) = user_id);
