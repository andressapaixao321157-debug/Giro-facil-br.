-- Prevent authenticated clients from marking a listing as paid during INSERT.
-- Payment state is maintained by trusted server-side payment flows.
-- Preserve the existing client insert contract while excluding payment_status.
REVOKE INSERT (pagamento_status) ON TABLE public.anuncios FROM authenticated;
REVOKE INSERT ON TABLE public.anuncios FROM authenticated;

GRANT INSERT (
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
  whatsapp,
  status,
  criado_em,
  created_at,
  updated_at
) ON TABLE public.anuncios TO authenticated;
