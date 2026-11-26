-- Allow public listing cards to read rounded coordinates, while only signed-in
-- advertisers may write them. Sensitive listing columns remain restricted.
grant select (latitude, longitude)
  on table public.anuncios to anon, authenticated;
grant insert (latitude, longitude)
  on table public.anuncios to authenticated;

do $$
begin
  if not has_column_privilege('anon','public.anuncios','latitude','SELECT')
     or not has_column_privilege('anon','public.anuncios','longitude','SELECT')
     or not has_column_privilege('authenticated','public.anuncios','latitude','SELECT')
     or not has_column_privilege('authenticated','public.anuncios','longitude','SELECT')
     or not has_column_privilege('authenticated','public.anuncios','latitude','INSERT')
     or not has_column_privilege('authenticated','public.anuncios','longitude','INSERT')
  then
    raise exception 'Geolocation column privileges were not applied';
  end if;
  if has_column_privilege('anon','public.anuncios','latitude','INSERT')
     or has_column_privilege('anon','public.anuncios','longitude','INSERT')
  then
    raise exception 'Anonymous geolocation inserts must remain denied';
  end if;
end $$;
