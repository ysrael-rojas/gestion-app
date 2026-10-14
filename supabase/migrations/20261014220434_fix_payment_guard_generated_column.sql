-- ===========================================================================
-- Migración: fix del guard de payment frente a la columna generada (SPEC 33)
-- ===========================================================================
-- `payment.receipt_number` es una columna GENERATED ALWAYS AS ... STORED: en un
-- trigger BEFORE UPDATE su valor no está disponible en NEW, así que el
-- comparativo de inmutabilidad de SPEC 30
-- (`to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD)`) rechazaba CUALQUIER update de
-- `payment`: anular un recibo, asignarle entidad o marcarlo verificado. Se
-- excluye `receipt_number` del comparativo.
--
-- La función se reproduce tal como la devuelve pg_get_functiondef, que es
-- exactamente lo aplicado en el proyecto.
-- ===========================================================================

CREATE OR REPLACE FUNCTION private.payment_guard_history_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  IF OLD.status = 'ANULADO' THEN
    RAISE EXCEPTION 'payment cannot be changed after voiding'
      USING ERRCODE = '23514';
  END IF;

  IF (to_jsonb(NEW) - ARRAY['entity_id', 'status', 'void_reason', 'voided_at', 'updated_at', 'receipt_number']::text[])
     IS DISTINCT FROM
     (to_jsonb(OLD) - ARRAY['entity_id', 'status', 'void_reason', 'voided_at', 'updated_at', 'receipt_number']::text[]) THEN
    RAISE EXCEPTION 'payment updates may only assign an entity, verify or void the payment'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.entity_id IS DISTINCT FROM OLD.entity_id THEN
    IF OLD.entity_id IS NOT NULL OR NEW.entity_id IS NULL THEN
      RAISE EXCEPTION 'payment entity can only be assigned once'
        USING ERRCODE = '23514';
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status
       OR NEW.void_reason IS DISTINCT FROM OLD.void_reason
       OR NEW.voided_at IS DISTINCT FROM OLD.voided_at THEN
      RAISE EXCEPTION 'payment assignment cannot be combined with voiding'
        USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'PROCESADO' THEN
      IF OLD.status <> 'EN_REVISION'
         OR NEW.void_reason IS DISTINCT FROM OLD.void_reason
         OR NEW.voided_at IS DISTINCT FROM OLD.voided_at THEN
        RAISE EXCEPTION 'payment status can only move from EN_REVISION to PROCESADO'
          USING ERRCODE = '23514';
      END IF;

      RETURN NEW;
    END IF;

    IF NEW.status <> 'ANULADO' OR OLD.status NOT IN ('EN_REVISION', 'PROCESADO') THEN
      RAISE EXCEPTION 'payment status can only transition once to ANULADO'
        USING ERRCODE = '23514';
    END IF;

    IF NEW.void_reason IS NULL OR NEW.voided_at IS NULL THEN
      RAISE EXCEPTION 'void_reason and voided_at are required when voiding a payment'
        USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
  END IF;

  IF NEW.void_reason IS DISTINCT FROM OLD.void_reason
     OR NEW.voided_at IS DISTINCT FROM OLD.voided_at THEN
    RAISE EXCEPTION 'payment void fields can only change during the void transition'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;
