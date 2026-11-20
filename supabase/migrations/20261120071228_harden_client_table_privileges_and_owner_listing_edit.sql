-- Least-privilege grants for client-facing roles; RLS remains the row-level boundary.
REVOKE ALL PRIVILEGES ON TABLE
  public.anuncios, public.conversas, public.mensagens, public.payment_orders,
  public.asaas_webhook_events, public.ad_boosts, public.store_plans, public.perfis,
  public.partner_accounts, public.partner_applications,
  public.acquisition_events, public.acquisition_leads
FROM anon, authenticated;

-- Public marketplace reads are limited to active/public data by existing RLS policies.
GRANT SELECT ON TABLE public.anuncios, public.ad_boosts, public.store_plans TO anon;

-- Signed-in marketplace operations, still constrained by the existing RLS policies.
GRANT SELECT ON TABLE public.anuncios, public.conversas, public.mensagens,
  public.payment_orders, public.ad_boosts, public.store_plans,
  public.perfis, public.partner_accounts, public.partner_applications TO authenticated;

GRANT INSERT ON TABLE public.anuncios, public.conversas, public.mensagens,
  public.partner_applications TO authenticated;
GRANT DELETE ON TABLE public.anuncios TO authenticated;
GRANT INSERT ON TABLE public.acquisition_events, public.acquisition_leads TO anon, authenticated;

-- Profile signup uses upsert(id,nome); only ordinary profile fields are client-editable.
GRANT INSERT (id, nome) ON TABLE public.perfis TO authenticated;
GRANT UPDATE (nome, telefone, cidade, estado) ON TABLE public.perfis TO authenticated;

-- Owners may edit only the title and price in the current UI; ownership remains enforced by RLS.
GRANT UPDATE (titulo, preco) ON TABLE public.anuncios TO authenticated;
DROP POLICY IF EXISTS anuncios_owner_update_basic ON public.anuncios;
CREATE POLICY anuncios_owner_update_basic ON public.anuncios
  FOR UPDATE TO authenticated
  USING (usuario_id = (SELECT auth.uid()))
  WITH CHECK (usuario_id = (SELECT auth.uid()));
