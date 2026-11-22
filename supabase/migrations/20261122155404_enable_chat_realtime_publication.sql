-- Publish only the private chat tables needed by the in-app realtime inbox.
-- Row Level Security remains enabled and participant policies continue to filter rows.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'mensagens'
  ) then
    alter publication supabase_realtime add table public.mensagens;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'conversas'
  ) then
    alter publication supabase_realtime add table public.conversas;
  end if;
end
$$;
