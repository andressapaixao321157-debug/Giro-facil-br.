-- Rebuild all client privileges from a clean column-level baseline.
-- REVOKE table privileges alone does not remove prior column grants.
REVOKE ALL PRIVILEGES ON TABLE public.anuncios FROM anon, authenticated;
REVOKE SELECT (id, usuario_id, titulo, categoria, marca, modelo, ano, preco, descricao, cidade, estado, fotos, whatsapp, status, criado_em, created_at, pagamento_status, updated_at) ON TABLE public.anuncios FROM anon, authenticated;
REVOKE INSERT (id, usuario_id, titulo, categoria, marca, modelo, ano, preco, descricao, cidade, estado, fotos, whatsapp, status, criado_em, created_at, pagamento_status, updated_at) ON TABLE public.anuncios FROM anon, authenticated;
REVOKE UPDATE (id, usuario_id, titulo, categoria, marca, modelo, ano, preco, descricao, cidade, estado, fotos, whatsapp, status, criado_em, created_at, pagamento_status, updated_at) ON TABLE public.anuncios FROM anon, authenticated;
GRANT SELECT (id, usuario_id, titulo, categoria, marca, modelo, ano, preco, descricao, cidade, estado, fotos, status, criado_em, created_at, updated_at) ON TABLE public.anuncios TO anon, authenticated;
GRANT INSERT (usuario_id, titulo, categoria, marca, modelo, ano, preco, descricao, cidade, estado, fotos, status) ON TABLE public.anuncios TO authenticated;
GRANT UPDATE (titulo, preco, status) ON TABLE public.anuncios TO authenticated;
GRANT DELETE ON TABLE public.anuncios TO authenticated;
DO $$
BEGIN
  IF has_table_privilege('anon','public.anuncios','SELECT') OR has_column_privilege('anon','public.anuncios','whatsapp','SELECT') OR has_column_privilege('anon','public.anuncios','pagamento_status','SELECT') THEN RAISE EXCEPTION 'anon retains table-wide or sensitive SELECT'; END IF;
  IF has_table_privilege('authenticated','public.anuncios','SELECT') OR has_column_privilege('authenticated','public.anuncios','whatsapp','SELECT') OR has_column_privilege('authenticated','public.anuncios','pagamento_status','SELECT') THEN RAISE EXCEPTION 'authenticated retains table-wide or sensitive SELECT'; END IF;
  IF has_table_privilege('authenticated','public.anuncios','INSERT') OR has_column_privilege('authenticated','public.anuncios','whatsapp','INSERT') OR has_column_privilege('authenticated','public.anuncios','pagamento_status','INSERT') OR has_column_privilege('authenticated','public.anuncios','id','INSERT') OR has_column_privilege('authenticated','public.anuncios','created_at','INSERT') OR has_column_privilege('authenticated','public.anuncios','criado_em','INSERT') OR has_column_privilege('authenticated','public.anuncios','updated_at','INSERT') THEN RAISE EXCEPTION 'authenticated retains table-wide or non-allowlisted INSERT'; END IF;
  IF NOT has_column_privilege('anon','public.anuncios','titulo','SELECT') OR NOT has_column_privilege('authenticated','public.anuncios','titulo','SELECT') OR NOT has_column_privilege('authenticated','public.anuncios','titulo','INSERT') OR NOT has_column_privilege('authenticated','public.anuncios','status','UPDATE') OR NOT has_table_privilege('authenticated','public.anuncios','DELETE') THEN RAISE EXCEPTION 'expected listing privileges were not preserved'; END IF;
END $$;