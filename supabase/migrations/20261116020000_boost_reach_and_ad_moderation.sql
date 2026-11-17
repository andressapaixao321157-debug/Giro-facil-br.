-- Giro Fácil BR: prioridade de exposição por investimento e moderação administrativa.
-- Seguro para reexecutar; não apaga anúncios nem pagamentos existentes.

alter table public.ad_boosts
  add column if not exists reach_multiplier integer not null default 1
  check (reach_multiplier between 1 and 10);

create index if not exists ad_boosts_listing_active_idx
  on public.ad_boosts (listing_id, status, ends_at desc);

drop policy if exists anuncios_admin_moderate on public.anuncios;
create policy anuncios_admin_moderate
on public.anuncios
for update
to authenticated
using (
  exists (
    select 1 from public.perfis
    where perfis.id = auth.uid() and perfis.papel = 'admin'
  )
)
with check (
  exists (
    select 1 from public.perfis
    where perfis.id = auth.uid() and perfis.papel = 'admin'
  )
);
