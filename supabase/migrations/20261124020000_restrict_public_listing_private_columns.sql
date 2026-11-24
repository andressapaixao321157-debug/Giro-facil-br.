-- Keep public listings readable while withholding private contact and payment fields.
-- Existing RLS policies continue to determine which rows each role may see.
-- Revoke broad table access, then grant only the columns used by the public marketplace.
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
