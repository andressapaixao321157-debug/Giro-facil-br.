create index if not exists ad_boosts_user_id_idx on public.ad_boosts (user_id);
create index if not exists mensagens_remetente_id_idx on public.mensagens (remetente_id);
create index if not exists payment_orders_listing_id_idx on public.payment_orders (listing_id);
create index if not exists store_plans_user_id_idx on public.store_plans (user_id);
