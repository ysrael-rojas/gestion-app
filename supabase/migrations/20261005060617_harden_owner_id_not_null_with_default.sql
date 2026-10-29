-- SPEC 16 — Paso 2: owner_id NOT NULL con DEFAULT auth.uid() en las 5 tablas.
-- El DEFAULT cubre el caso normal (INSERT autenticado sin owner_id);
-- un INSERT sin sesión evalúa auth.uid() como NULL y viola NOT NULL (rechazo explícito).
ALTER TABLE public.entidad            ALTER COLUMN owner_id SET DEFAULT auth.uid();
ALTER TABLE public.entidad            ALTER COLUMN owner_id SET NOT NULL;
ALTER TABLE public.comprobante        ALTER COLUMN owner_id SET DEFAULT auth.uid();
ALTER TABLE public.comprobante        ALTER COLUMN owner_id SET NOT NULL;
ALTER TABLE public.payment            ALTER COLUMN owner_id SET DEFAULT auth.uid();
ALTER TABLE public.payment            ALTER COLUMN owner_id SET NOT NULL;
ALTER TABLE public.payment_allocation ALTER COLUMN owner_id SET DEFAULT auth.uid();
ALTER TABLE public.payment_allocation ALTER COLUMN owner_id SET NOT NULL;
ALTER TABLE public.cash_account       ALTER COLUMN owner_id SET DEFAULT auth.uid();
ALTER TABLE public.cash_account       ALTER COLUMN owner_id SET NOT NULL;
