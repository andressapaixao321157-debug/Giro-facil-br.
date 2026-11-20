-- Allow the owner's administrator account to register zero-cost boosts.
-- The Edge Function enforces that only papel='admin' can use this path.
ALTER TABLE public.payment_orders
  DROP CONSTRAINT IF EXISTS payment_orders_amount_check;
ALTER TABLE public.payment_orders
  ADD CONSTRAINT payment_orders_amount_check CHECK (amount >= 0);

ALTER TABLE public.ad_boosts
  DROP CONSTRAINT IF EXISTS ad_boosts_amount_check;
ALTER TABLE public.ad_boosts
  ADD CONSTRAINT ad_boosts_amount_check CHECK (amount >= 0);
