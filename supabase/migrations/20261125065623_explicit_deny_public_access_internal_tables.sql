CREATE POLICY "deny_client_access_giro_rapido" ON public."Giro rápido br" FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY "deny_client_access_asaas_webhook_events" ON public.asaas_webhook_events FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
