-- Limit client access to non-sensitive listing fields.
-- RLS continues to decide which rows each role may see or modify.
REVOKE ALL PRIVILEGES ON TABLE public.anuncios FROM anon, authenticated;

-- Explicitly remove any direct column grants left by earlier migrations.
REVOKE SELECT (whatsapp, pagamento_status) ON TABLE public.anuncios FROM anon, authenticated;
REVOKE INSERT (whatsapp, pagamento_status) ON TABLE public.anuncios FROM anon, authenticated;

-- Public marketplace cards/details and authenticated owner views use this allowlist.
GRANT SELECT (
  id, usuario_id, titulo, categoria, marca, modelo, ano, preco, descricao,
  cidade, estado, fotos, status, criado_em, created_at, updated_at
) ON TABLE public.anuncios TO anon, authenticated;

-- New listings can only be created with user-supplied listing fields.
-- RLS still forces usuario_id = auth.uid() and status = 'pendente'.
GRANT INSERT (
  usuario_id, titulo, categoria, marca, modelo, ano, preco, descricao,
  cidade, estado, fotos, status
) ON TABLE public.anuncios TO authenticated;

-- Preserve existing owner operations, with RLS enforcing row ownership.
GRANT UPDATE (titulo, preco, status) ON TABLE public.anuncios TO authenticated;
GRANT DELETE ON TABLE public.anuncios TO authenticated;
