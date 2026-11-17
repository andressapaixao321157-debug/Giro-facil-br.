-- Trigger-only function; prevent direct invocation by API roles.
revoke execute on function public.touch_conversa_on_message() from public, anon, authenticated;
grant execute on function public.touch_conversa_on_message() to service_role;
