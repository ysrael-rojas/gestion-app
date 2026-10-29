-- SPEC 16 — Paso 3: políticas RLS de DELETE (owner_id = auth.uid()) en las 5 tablas.
CREATE POLICY "entidad_delete"            ON public.entidad            FOR DELETE TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "comprobante_delete"        ON public.comprobante        FOR DELETE TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "payment_delete"            ON public.payment            FOR DELETE TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "payment_allocation_delete" ON public.payment_allocation FOR DELETE TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "cash_account_delete"       ON public.cash_account       FOR DELETE TO authenticated USING (owner_id = auth.uid());
