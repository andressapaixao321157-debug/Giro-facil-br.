-- Keep the provider environment attached to every Asaas-backed order.
-- Existing rows remain NULL because their historical provider environment cannot
-- be inferred safely from the database alone.
ALTER TABLE public.payment_orders
  ADD COLUMN IF NOT EXISTS asaas_environment text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'payment_orders_asaas_environment_check'
      AND conrelid = 'public.payment_orders'::regclass
  ) THEN
    ALTER TABLE public.payment_orders
      ADD CONSTRAINT payment_orders_asaas_environment_check
      CHECK (asaas_environment IS NULL OR asaas_environment IN ('sandbox', 'production'));
  END IF;
END $$;
