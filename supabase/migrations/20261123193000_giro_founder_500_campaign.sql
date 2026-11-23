-- Campanha comercial dos 500 Parceiros Fundadores Giro Fácil BR.
-- A meta comercial é alcançar 500 parceiros; não há limite de estoque de benefícios nem sorteio.
create schema if not exists giro_private;
revoke all on schema giro_private from public, anon, authenticated;

create sequence if not exists giro_private.giro_founder_500_seq
  start with 1 increment by 1 minvalue 1 no maxvalue no cycle;
revoke all on sequence giro_private.giro_founder_500_seq from public, anon, authenticated;

alter table public.partner_applications
  add column if not exists founder_campaign_code text
    check (founder_campaign_code is null or founder_campaign_code = 'fundadores-500'),
  add column if not exists founder_number integer;

create unique index if not exists partner_founder_number_unique
  on public.partner_applications(founder_number)
  where founder_campaign_code = 'fundadores-500' and founder_number is not null;
create unique index if not exists partner_founder_user_once
  on public.partner_applications(user_id)
  where founder_campaign_code = 'fundadores-500';

create or replace function giro_private.assign_giro_founder_number()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.founder_campaign_code is null then
    new.founder_number := null;
    return new;
  end if;
  if new.founder_campaign_code <> 'fundadores-500' then
    raise exception 'Código de campanha inválido';
  end if;
  new.founder_number := nextval('giro_private.giro_founder_500_seq'::regclass);
  return new;
end;
$$;
revoke all on function giro_private.assign_giro_founder_number() from public, anon, authenticated;

drop trigger if exists partner_applications_assign_founder_number on public.partner_applications;
create trigger partner_applications_assign_founder_number
before insert on public.partner_applications
for each row execute function giro_private.assign_giro_founder_number();

alter table public.store_plans
  add column if not exists founder_turbo_claimed_at timestamptz;

create index if not exists store_plans_founder_active_idx
  on public.store_plans(user_id, status, created_at desc)
  where plan_code = 'loja_fundador';
