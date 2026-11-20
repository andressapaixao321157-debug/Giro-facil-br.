-- Giro Fácil BR: métricas privadas de anúncios e gestão do anunciante
ALTER TABLE public.anuncios
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION public.giro_touch_anuncio_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS giro_anuncios_touch_updated_at ON public.anuncios;
CREATE TRIGGER giro_anuncios_touch_updated_at
BEFORE UPDATE ON public.anuncios
FOR EACH ROW EXECUTE FUNCTION public.giro_touch_anuncio_updated_at();

CREATE OR REPLACE FUNCTION public.giro_guard_owner_listing_status()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF auth.uid() = OLD.usuario_id AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status <> 'ativo' OR NEW.status <> 'vendido' THEN
      RAISE EXCEPTION 'O anunciante só pode marcar como vendido um anúncio ativo.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS giro_guard_owner_listing_status ON public.anuncios;
CREATE TRIGGER giro_guard_owner_listing_status
BEFORE UPDATE OF status ON public.anuncios
FOR EACH ROW EXECUTE FUNCTION public.giro_guard_owner_listing_status();

GRANT UPDATE (status) ON public.anuncios TO authenticated;

CREATE TABLE IF NOT EXISTS public.listing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.anuncios(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('view','click','contact')),
  visitor_key uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT listing_events_unique_visitor UNIQUE (listing_id, event_type, visitor_key)
);

CREATE INDEX IF NOT EXISTS listing_events_listing_type_idx
  ON public.listing_events (listing_id, event_type, created_at DESC);

ALTER TABLE public.listing_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.listing_events FROM anon, authenticated;
GRANT INSERT ON public.listing_events TO anon, authenticated;
GRANT SELECT ON public.listing_events TO authenticated;

DROP POLICY IF EXISTS listing_events_public_insert ON public.listing_events;
CREATE POLICY listing_events_public_insert ON public.listing_events
  FOR INSERT TO anon
  WITH CHECK (
    event_type IN ('view','click','contact')
    AND EXISTS (
      SELECT 1 FROM public.anuncios a
      WHERE a.id = listing_id AND a.status = 'ativo'
    )
  );

DROP POLICY IF EXISTS listing_events_user_insert ON public.listing_events;
CREATE POLICY listing_events_user_insert ON public.listing_events
  FOR INSERT TO authenticated
  WITH CHECK (
    event_type IN ('view','click','contact')
    AND EXISTS (
      SELECT 1 FROM public.anuncios a
      WHERE a.id = listing_id
        AND a.status = 'ativo'
        AND a.usuario_id <> (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS listing_events_owner_read ON public.listing_events;
CREATE POLICY listing_events_owner_read ON public.listing_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.anuncios a
      WHERE a.id = listing_id AND a.usuario_id = (SELECT auth.uid())
    )
  );
