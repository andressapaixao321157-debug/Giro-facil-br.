-- Giro Fácil BR: captação nacional e CRM de interessados
create table if not exists public.acquisition_leads (
 id uuid primary key default gen_random_uuid(), user_id uuid null references auth.users(id) on delete set null,
 lead_type text not null default 'anunciante' check(lead_type in ('anunciante','loja','parceiro')),
 contact_name text not null check(char_length(trim(contact_name)) between 2 and 120),
 business_name text null check(business_name is null or char_length(business_name)<=160),
 email text null check(email is null or char_length(email)<=254),
 phone text not null check(char_length(regexp_replace(phone,'[^0-9]','','g')) between 10 and 13),
 category text null check(category is null or char_length(category)<=80),
 city text not null check(char_length(trim(city)) between 2 and 100),
 state char(2) not null check(state ~ '^[A-Z]{2}$'),
 message text null check(message is null or char_length(message)<=1000),
 source text not null default 'organico' check(source in ('organico','indicacao','direto','social','busca','outro')),
 campaign text null check(campaign is null or char_length(campaign)<=120),
 referral_code text null check(referral_code is null or char_length(referral_code)<=32),
 consent_lgpd boolean not null default false check(consent_lgpd=true),
 status text not null default 'novo' check(status in ('novo','em_contato','qualificado','convertido','descartado')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists acquisition_leads_created_idx on public.acquisition_leads(created_at desc);
create index if not exists acquisition_leads_region_idx on public.acquisition_leads(state,city);
create index if not exists acquisition_leads_status_idx on public.acquisition_leads(status);
alter table public.acquisition_leads enable row level security;
revoke all on public.acquisition_leads from anon,authenticated;
grant insert on public.acquisition_leads to anon,authenticated;
grant select,update on public.acquisition_leads to authenticated;
drop policy if exists acquisition_leads_public_insert on public.acquisition_leads;
create policy acquisition_leads_public_insert on public.acquisition_leads for insert to anon with check(user_id is null and consent_lgpd=true and status='novo');
drop policy if exists acquisition_leads_user_insert on public.acquisition_leads;
create policy acquisition_leads_user_insert on public.acquisition_leads for insert to authenticated with check((select auth.uid()) is not null and (user_id is null or user_id=(select auth.uid())) and consent_lgpd=true and status='novo');
drop policy if exists acquisition_leads_admin_read on public.acquisition_leads;
create policy acquisition_leads_admin_read on public.acquisition_leads for select to authenticated using(exists(select 1 from public.perfis p where p.id=(select auth.uid()) and p.papel='admin'));
drop policy if exists acquisition_leads_admin_update on public.acquisition_leads;
create policy acquisition_leads_admin_update on public.acquisition_leads for update to authenticated using(exists(select 1 from public.perfis p where p.id=(select auth.uid()) and p.papel='admin')) with check(exists(select 1 from public.perfis p where p.id=(select auth.uid()) and p.papel='admin'));
create table if not exists public.acquisition_events (
 id bigint generated always as identity primary key,
 event_name text not null check(event_name in ('page_view','listing_view','signup','listing_created','partner_lead','referral_visit')),
 user_id uuid null references auth.users(id) on delete set null,
 listing_id uuid null references public.anuncios(id) on delete set null,
 region_state char(2) null check(region_state is null or region_state ~ '^[A-Z]{2}$'),
 source text not null default 'organico' check(source in ('organico','indicacao','direto','social','busca','outro')),
 campaign text null check(campaign is null or char_length(campaign)<=120),
 referral_code text null check(referral_code is null or char_length(referral_code)<=32),
 session_key text null check(session_key is null or char_length(session_key)<=80),
 created_at timestamptz not null default now()
);
create index if not exists acquisition_events_created_idx on public.acquisition_events(created_at desc);
create index if not exists acquisition_events_name_idx on public.acquisition_events(event_name,created_at desc);
alter table public.acquisition_events enable row level security;
revoke all on public.acquisition_events from anon,authenticated;
grant insert on public.acquisition_events to anon,authenticated;
grant select on public.acquisition_events to authenticated;
drop policy if exists acquisition_events_public_insert on public.acquisition_events;
create policy acquisition_events_public_insert on public.acquisition_events for insert to anon with check(user_id is null);
drop policy if exists acquisition_events_user_insert on public.acquisition_events;
create policy acquisition_events_user_insert on public.acquisition_events for insert to authenticated with check(user_id is null or user_id=(select auth.uid()));
drop policy if exists acquisition_events_admin_read on public.acquisition_events;
create policy acquisition_events_admin_read on public.acquisition_events for select to authenticated using(exists(select 1 from public.perfis p where p.id=(select auth.uid()) and p.papel='admin'));
