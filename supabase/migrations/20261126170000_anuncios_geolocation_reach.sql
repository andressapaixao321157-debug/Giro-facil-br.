-- Giro Fácil BR: coordenadas aproximadas para distribuição local de anúncios.
-- A localização é opcional e arredondada no cliente antes do envio (aprox. 1 km).
alter table public.anuncios
  add column if not exists latitude numeric(8,5),
  add column if not exists longitude numeric(8,5);

alter table public.anuncios
  drop constraint if exists anuncios_latitude_range_check,
  drop constraint if exists anuncios_longitude_range_check;

alter table public.anuncios
  add constraint anuncios_latitude_range_check
    check (latitude is null or latitude between -90 and 90),
  add constraint anuncios_longitude_range_check
    check (longitude is null or longitude between -180 and 180);

create index if not exists anuncios_geo_coords_idx
  on public.anuncios (latitude, longitude)
  where latitude is not null and longitude is not null;
