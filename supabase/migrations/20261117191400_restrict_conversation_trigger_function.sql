-- A função é executada somente pelo trigger; não deve ser chamada via RPC.
revoke all on function public.touch_conversa_on_message() from public, anon, authenticated;
