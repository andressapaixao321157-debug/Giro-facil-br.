-- Restrict direct execution of the profile protection trigger function.
revoke execute on function public.protect_profile_privileged_fields() from public, anon, authenticated;
grant execute on function public.protect_profile_privileged_fields() to service_role;
