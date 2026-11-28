create unique index if not exists partner_applications_one_pending_per_user on public.partner_applications(user_id) where status = 'pendente';
