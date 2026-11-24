drop policy if exists platform_settings_public_read on public.platform_settings;
create policy platform_settings_public_read on public.platform_settings
for select to anon, authenticated
using (setting_key in ('support_chat_enabled','public_notice'));
grant select on public.platform_settings to anon, authenticated;
