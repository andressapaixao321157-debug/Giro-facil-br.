-- Keep marketplace listings public while excluding private contact and internal payment fields.
-- RLS policies continue to decide which rows each client role may read.
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
