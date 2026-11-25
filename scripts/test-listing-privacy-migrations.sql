\set ON_ERROR_STOP on

-- Isolated PostgreSQL fixture: never connects to the Giro Fácil production database.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;

CREATE TABLE public.anuncios (
  id uuid PRIMARY KEY,
  usuario_id uuid,
  titulo text,
  categoria text,
  marca text,
  modelo text,
  ano integer,
  preco numeric,
  descricao text,
  cidade text,
  estado text,
  fotos text[],
  whatsapp text,
  status text,
  criado_em timestamptz,
  created_at timestamptz,
  pagamento_status text,
  updated_at timestamptz
);

-- Reproduce the broad client grants that the migrations are intended to remove.
GRANT SELECT ON TABLE public.anuncios TO anon, authenticated;
GRANT INSERT ON TABLE public.anuncios TO authenticated;
GRANT UPDATE (titulo, preco, status) ON TABLE public.anuncios TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.anuncios TO service_role;

ALTER TABLE public.anuncios ENABLE ROW LEVEL SECURITY;
CREATE POLICY anuncios_public_read_active
  ON public.anuncios FOR SELECT TO anon
  USING (status = 'ativo');
CREATE POLICY anuncios_authenticated_read
  ON public.anuncios FOR SELECT TO authenticated
  USING (status = 'ativo');

-- Apply the exact migration files from this pull request.
\ir ../supabase/migrations/20261124020000_restrict_public_listing_private_columns.sql
\ir ../supabase/migrations/20261124020100_restrict_client_payment_status_insert.sql

DO $$
DECLARE
  anon_select_columns integer;
  authenticated_select_columns integer;
  authenticated_insert_columns integer;
BEGIN
  IF has_column_privilege('anon', 'public.anuncios', 'whatsapp', 'SELECT')
     OR has_column_privilege('anon', 'public.anuncios', 'pagamento_status', 'SELECT') THEN
    RAISE EXCEPTION 'anon can still read a private anuncios column';
  END IF;

  IF has_column_privilege('authenticated', 'public.anuncios', 'whatsapp', 'SELECT')
     OR has_column_privilege('authenticated', 'public.anuncios', 'pagamento_status', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated can still read a private anuncios column';
  END IF;

  IF has_column_privilege('authenticated', 'public.anuncios', 'pagamento_status', 'INSERT') THEN
    RAISE EXCEPTION 'authenticated can still insert pagamento_status';
  END IF;

  IF NOT has_column_privilege('anon', 'public.anuncios', 'titulo', 'SELECT')
     OR NOT has_column_privilege('authenticated', 'public.anuncios', 'titulo', 'SELECT') THEN
    RAISE EXCEPTION 'public listing columns are not readable';
  END IF;

  IF NOT has_column_privilege('authenticated', 'public.anuncios', 'whatsapp', 'INSERT') THEN
    RAISE EXCEPTION 'the authenticated listing form lost its whatsapp INSERT permission';
  END IF;

  IF NOT has_column_privilege('authenticated', 'public.anuncios', 'titulo', 'UPDATE')
     OR NOT has_column_privilege('authenticated', 'public.anuncios', 'preco', 'UPDATE')
     OR NOT has_column_privilege('authenticated', 'public.anuncios', 'status', 'UPDATE') THEN
    RAISE EXCEPTION 'existing owner-edit UPDATE column grants were not preserved';
  END IF;

  IF has_table_privilege('anon', 'public.anuncios', 'SELECT')
     OR has_table_privilege('authenticated', 'public.anuncios', 'SELECT')
     OR has_table_privilege('authenticated', 'public.anuncios', 'INSERT') THEN
    RAISE EXCEPTION 'a broad table-level client grant remains';
  END IF;

  SELECT count(*) INTO anon_select_columns
  FROM information_schema.column_privileges
  WHERE table_schema = 'public' AND table_name = 'anuncios'
    AND grantee = 'anon' AND privilege_type = 'SELECT';

  SELECT count(*) INTO authenticated_select_columns
  FROM information_schema.column_privileges
  WHERE table_schema = 'public' AND table_name = 'anuncios'
    AND grantee = 'authenticated' AND privilege_type = 'SELECT';

  SELECT count(*) INTO authenticated_insert_columns
  FROM information_schema.column_privileges
  WHERE table_schema = 'public' AND table_name = 'anuncios'
    AND grantee = 'authenticated' AND privilege_type = 'INSERT';

  IF anon_select_columns <> 16 OR authenticated_select_columns <> 16 THEN
    RAISE EXCEPTION 'expected exactly 16 public SELECT columns; got anon %, authenticated %',
      anon_select_columns, authenticated_select_columns;
  END IF;

  IF authenticated_insert_columns <> 17 THEN
    RAISE EXCEPTION 'expected exactly 17 listing-form INSERT columns; got %',
      authenticated_insert_columns;
  END IF;

  IF NOT has_column_privilege('service_role', 'public.anuncios', 'whatsapp', 'SELECT')
     OR NOT has_column_privilege('service_role', 'public.anuncios', 'pagamento_status', 'SELECT')
     OR NOT has_column_privilege('service_role', 'public.anuncios', 'pagamento_status', 'INSERT') THEN
    RAISE EXCEPTION 'trusted service_role privileges were changed';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class
    WHERE oid = 'public.anuncios'::regclass AND relrowsecurity
  ) THEN
    RAISE EXCEPTION 'RLS was unexpectedly disabled';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'anuncios'
      AND policyname = 'anuncios_public_read_active'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'anuncios'
      AND policyname = 'anuncios_authenticated_read'
  ) THEN
    RAISE EXCEPTION 'existing row-visibility policies were not preserved';
  END IF;
END
$$;

\echo 'PASS: isolated PostgreSQL migration test — private SELECT blocked, payment INSERT blocked, public listing and trusted server grants preserved.'
