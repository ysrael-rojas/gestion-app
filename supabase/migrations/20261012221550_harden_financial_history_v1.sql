-- Apply SPEC 30 financial-history hardening (remote migration 20261012221550).
DROP POLICY IF EXISTS cash_close_delete ON public.cash_close;
DROP POLICY IF EXISTS cash_close_update ON public.cash_close;
REVOKE UPDATE, DELETE ON TABLE public.cash_close FROM anon, authenticated;

DROP POLICY IF EXISTS payment_allocation_delete ON public.payment_allocation;
DROP POLICY IF EXISTS payment_allocation_update ON public.payment_allocation;
REVOKE UPDATE, DELETE ON TABLE public.payment_allocation FROM anon, authenticated;

-- Payments may only be assigned once or voided once by their owner.
DROP POLICY IF EXISTS payment_delete ON public.payment;
REVOKE DELETE ON TABLE public.payment FROM anon, authenticated;
REVOKE UPDATE ON TABLE public.payment FROM anon, authenticated;
GRANT UPDATE (entity_id, status, void_reason, voided_at)
  ON TABLE public.payment TO authenticated;

-- Keep all SPEC 26 statuses compatible with the void-field invariant.
ALTER TABLE public.payment
  DROP CONSTRAINT IF EXISTS payment_void_check;
ALTER TABLE public.payment
  ADD CONSTRAINT payment_void_check
  CHECK (
    (status = 'ANULADO' AND void_reason IS NOT NULL AND voided_at IS NOT NULL)
    OR
    (status IN ('EN_REVISION', 'PROCESADO') AND void_reason IS NULL AND voided_at IS NULL)
  );

CREATE OR REPLACE FUNCTION private.payment_freeze_amount()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  IF NEW.amount IS DISTINCT FROM OLD.amount THEN
    RAISE EXCEPTION 'payment.amount is immutable after insert'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS payment_freeze_amount ON public.payment;
CREATE TRIGGER payment_freeze_amount
  BEFORE UPDATE OF amount ON public.payment
  FOR EACH ROW
  EXECUTE FUNCTION private.payment_freeze_amount();

CREATE OR REPLACE FUNCTION private.payment_guard_history_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  IF OLD.status = 'ANULADO' THEN
    RAISE EXCEPTION 'payment cannot be changed after voiding'
      USING ERRCODE = '23514';
  END IF;

  IF (to_jsonb(NEW) - ARRAY['entity_id', 'status', 'void_reason', 'voided_at', 'updated_at']::text[])
     IS DISTINCT FROM
     (to_jsonb(OLD) - ARRAY['entity_id', 'status', 'void_reason', 'voided_at', 'updated_at']::text[]) THEN
    RAISE EXCEPTION 'payment updates may only assign an entity or void the payment'
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

DROP TRIGGER IF EXISTS payment_guard_history_mutation ON public.payment;
CREATE TRIGGER payment_guard_history_mutation
  BEFORE UPDATE ON public.payment
  FOR EACH ROW
  EXECUTE FUNCTION private.payment_guard_history_mutation();
