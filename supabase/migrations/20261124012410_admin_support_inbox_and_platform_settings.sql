create table if not exists public.platform_settings (
  setting_key text primary key check (setting_key in ('support_chat_enabled','new_registrations_enabled','public_notice')),
  setting_value jsonb not null,
  description text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);
alter table public.platform_settings enable row level security;
revoke all on table public.platform_settings from anon, authenticated;
insert into public.platform_settings (setting_key, setting_value, description)
values
 ('support_chat_enabled','true'::jsonb,'Habilita o atendimento por chat dentro da plataforma'),
 ('new_registrations_enabled','true'::jsonb,'Permite novos cadastros de usuários'),
 ('public_notice','""'::jsonb,'Aviso público exibido no site')
on conflict (setting_key) do nothing;
