-- Keep marketplace listings public while excluding private contact and internal payment fields.
-- Existing RLS policies continue to decide which rows each client role may read.
-- Revoke broad table access before granting only the fields needed by the marketplace UI.
REVOKE SELECT (whatsapp, pagamento_status) ON TABLE public.anuncios FROM anon, authenticated;
REVOKE SELECT ON TABLE public.anuncios FROM anon, authenticated;

GRANT SELECT (
  id,
  usuario_id,
  titulo,
  categoria,
  marca,
  modelo,
  ano,
  preco,
  descricao,
  cidade,
  estado,
  fotos,
  status,
  criado_em,
  created_at,
  updated_at
) ON TABLE public.anuncios TO anon, authenticated;
