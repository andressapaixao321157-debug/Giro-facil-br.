-- Keep public listings readable while withholding private contact and payment fields.
-- RLS policies continue to determine which rows are visible to each role.
-- Remove broad table grants before granting only the marketplace's public projection.
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
