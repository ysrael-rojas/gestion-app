-- =========================================================================
-- Migración: recreate_create_payment_rpc_no_receipt_year
-- =========================================================================
-- Recrea la RPC `public.create_payment_with_allocations` (SPEC 13) sin la
-- referencia a la columna `receipt_year`, eliminada en la migración
-- `20260930120000_rename_receipt_format_drop_year`.
--
-- Sin este reemplazo, toda llamada a la RPC falla con:
--   42703: column "receipt_year" of relation "payment" does not exist
-- y el registro de pagos queda roto por completo.
--
-- El body es el de SPEC 13, con dos ajustes:
--   - No se lista `receipt_serial` en el INSERT: lo escribe el trigger
--     `payment_assign_receipt` (private.assign_receipt_number) en
--     BEFORE INSERT, dentro de la misma transacción.
--   - No se referencia `receipt_year` en ningún punto.
--
-- `create or replace` conserva dependencias y evita una ventana donde la
-- función no exista. Se reafirman los grants alineados con la migración
-- `20261003120000_rls_owner_isolation.sql` (solo `authenticated` y
-- `service_role`; `anon` ya no debe ejecutarla).
--
-- Asume aplicadas las migraciones de SPEC 09 y SPEC 13.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.create_payment_with_allocations(
  p_entity_id     uuid,
  p_direction     public.payment_direction,
  p_payment_date  date,
  p_amount        numeric(12,2),
  p_method        public.payment_method,
  p_reference     text,
  p_notes         text,
  p_allocations   jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_payment_id     uuid;
  v_item           jsonb;
  v_comprobante_id uuid;
  v_alloc_amount   numeric(12,2);
  v_total          numeric(12,2);
  v_paid           numeric(12,2);
BEGIN
  -- 1) Insert del pago. El trigger payment_assign_receipt
  --    (private.assign_receipt_number) escribe receipt_serial
  --    en BEFORE INSERT, dentro de esta misma transacción,
  --    así que un fallo posterior hace rollback también del
  --    correlativo (no quedan huecos).
  INSERT INTO public.payment (
    entity_id, direction, payment_date, amount, method, reference, notes
  ) VALUES (
    p_entity_id, p_direction, p_payment_date, p_amount, p_method,
    nullif(p_reference, ''), nullif(p_notes, '')
  )
  RETURNING id INTO v_payment_id;

  -- 2) Inserciones de asignaciones una a una, bloqueando el
  --    comprobante para serializar contra otras altas concurrentes.
  IF p_allocations IS NOT NULL AND jsonb_array_length(p_allocations) > 0 THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_allocations)
    LOOP
      v_comprobante_id := (v_item->>'comprobante_id')::uuid;
      v_alloc_amount   := (v_item->>'amount')::numeric(12,2);

      IF v_alloc_amount <= 0 THEN
        RAISE EXCEPTION 'El importe asignado debe ser mayor a 0';
      END IF;

      SELECT c.total INTO v_total
        FROM public.comprobante c
       WHERE c.id = v_comprobante_id
         FOR UPDATE;

      IF v_total IS NULL THEN
        RAISE EXCEPTION 'El comprobante % no existe', v_comprobante_id;
      END IF;

      SELECT coalesce(sum(a.amount), 0) INTO v_paid
        FROM public.payment_allocation a
        JOIN public.payment p ON p.id = a.payment_id
       WHERE a.comprobante_id = v_comprobante_id
         AND p.status = 'REGISTRADO';

      IF v_paid + v_alloc_amount > v_total THEN
        RAISE EXCEPTION
          'La asignación supera el saldo del comprobante (%)', v_comprobante_id;
      END IF;

      INSERT INTO public.payment_allocation (payment_id, comprobante_id, amount)
      VALUES (v_payment_id, v_comprobante_id, v_alloc_amount);
    END LOOP;
  END IF;

  RETURN v_payment_id;
END;
$$;

-- Reafirmar permisos: la RPC solo la ejecutan usuarios autenticados y
-- service_role (alineado con 20261003120000_rls_owner_isolation.sql).
REVOKE EXECUTE ON FUNCTION public.create_payment_with_allocations(
  uuid, public.payment_direction, date, numeric, public.payment_method,
  text, text, jsonb
) FROM public, anon;

GRANT EXECUTE ON FUNCTION public.create_payment_with_allocations(
  uuid, public.payment_direction, date, numeric, public.payment_method,
  text, text, jsonb
) TO authenticated, service_role;
