-- =========================================================================
-- Migración: rename_receipt_format_drop_year
-- =========================================================================
-- Cambia el formato de recibos de pago de `RI-AAAA-NNNNNN` / `RE-AAAA-NNNNNN`
-- (con año + correlativo anual reiniciado) a `RI-NNNNNN` / `RE-NNNNNN`
-- (correlativo global por dirección, sin año).
--
-- Renumera los recibos ya emitidos preservando el orden histórico
-- (issue_date, created_at, id) para que los correlativos sean continuos y
-- no haya huecos.
--
-- Asume que la migración inicial `create_payment_tables` de SPEC 09 está
-- aplicada. Es de un solo uso: ejecutarla una vez.
-- =========================================================================

-- ---------------------------------------------------------------------------
-- Paso 1: Reasignar receipt_serial en orden cronológico por dirección.
--
-- ROW_NUMBER() asigna 1, 2, 3... por dirección ordenado por fecha de emisión,
-- luego por created_at y finalmente por id para empates deterministas. Esto
-- preserva el orden histórico de los recibos. No toca la unique constraint
-- actual porque cada fila sigue teniendo su (direction, receipt_year,
-- receipt_serial) original, que ya es único por sí solo.
-- ---------------------------------------------------------------------------
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY direction
      ORDER BY issue_date, created_at, id
    ) AS new_serial
  FROM public.payment
)
UPDATE public.payment p
SET receipt_serial = ranked.new_serial
FROM ranked
WHERE p.id = ranked.id;

-- ---------------------------------------------------------------------------
-- Paso 2: Reemplazar la columna generada receipt_number con la nueva fórmula
-- (sin año). Se hace antes de eliminar receipt_year y la constraint para que
-- la columna solo cambie una vez.
-- ---------------------------------------------------------------------------
ALTER TABLE public.payment DROP COLUMN receipt_number;

ALTER TABLE public.payment
  ADD COLUMN receipt_number text GENERATED ALWAYS AS (
    (CASE WHEN direction = 'INGRESO' THEN 'RI' ELSE 'RE' END)
    || '-' || lpad(receipt_serial::text, 6, '0')
  ) STORED;

-- ---------------------------------------------------------------------------
-- Paso 3: Eliminar receipt_year y recrear la unique constraint sin año.
-- La nueva constraint es (direction, receipt_serial): no debe chocar porque
-- los seriales ya se reasignaron en el paso 1 sin colisiones por dirección.
-- ---------------------------------------------------------------------------
ALTER TABLE public.payment DROP CONSTRAINT payment_receipt_unique;

ALTER TABLE public.payment DROP COLUMN receipt_year;

ALTER TABLE public.payment
  ADD CONSTRAINT payment_receipt_unique UNIQUE (direction, receipt_serial);

-- ---------------------------------------------------------------------------
-- Paso 4: Cambiar receipt_sequence a contador global por dirección.
-- - Drop PK actual (direction, year).
-- - Drop columna year.
-- - Truncate para descartar contadores anuales.
-- - Repoblar con MAX(receipt_serial) de los recibos existentes por dirección.
-- - Añadir PK nueva solo por direction.
-- ---------------------------------------------------------------------------
ALTER TABLE public.receipt_sequence DROP CONSTRAINT receipt_sequence_pkey;

ALTER TABLE public.receipt_sequence DROP COLUMN year;

TRUNCATE public.receipt_sequence;

INSERT INTO public.receipt_sequence (direction, last_serial)
SELECT direction, MAX(receipt_serial)
FROM public.payment
GROUP BY direction;

ALTER TABLE public.receipt_sequence
  ADD PRIMARY KEY (direction);

-- ---------------------------------------------------------------------------
-- Paso 5: Reemplazar las funciones y el trigger.
-- - next_receipt_serial: nueva versión (sin parametro de año).
-- - assign_receipt_number: ya no escribe receipt_year.
-- - Trigger payment_assign_receipt: apunta a la nueva función.
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS payment_assign_receipt ON public.payment;

DROP FUNCTION IF EXISTS private.assign_receipt_number();

DROP FUNCTION IF EXISTS private.next_receipt_serial(
  public.payment_direction, integer
);

CREATE FUNCTION private.next_receipt_serial(
  p_direction public.payment_direction
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_serial integer;
BEGIN
  INSERT INTO public.receipt_sequence AS s (direction, last_serial)
  VALUES (p_direction, 1)
  ON CONFLICT (direction) DO UPDATE
    SET last_serial = s.last_serial + 1
  RETURNING s.last_serial INTO v_serial;

  RETURN v_serial;
END;
$$;

CREATE FUNCTION private.assign_receipt_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  new.receipt_serial := private.next_receipt_serial(new.direction);
  RETURN new;
END;
$$;

CREATE TRIGGER payment_assign_receipt
  BEFORE INSERT ON public.payment
  FOR EACH ROW
  EXECUTE FUNCTION private.assign_receipt_number();