# Tarea: cambio de formato de recibos de pago

**Feature:** `cambio-formato-recibos`
**Estado:** en curso
**Rama:** `main`
**Spec relacionada:** `specs/09-pagos-y-recibos.md`

## Objetivo

Cambiar el formato de los recibos de ingreso (`RI`) y egreso (`RE`) del actual
`RI-AAAA-NNNNNN` / `RE-AAAA-NNNNNN` (con año + correlativo anual reiniciado) al
formato `RI-NNNNNN` / `RE-NNNNNN` (sin año, global por dirección).

Renumerar todos los recibos existentes preservando el orden histórico
(`issue_date`, `created_at`, `id`) para que los correlativos sean continuos y
no haya huecos después del cambio.

## Decisiones confirmadas con el usuario

1. **Formato final:** `RI-NNNNNN` / `RE-NNNNNN` (con guión antes del serial,
   sin año).
2. **Recibos ya emitidos:** se renumeran al formato nuevo en orden cronológico
   global por dirección. Se acepta que cualquier referencia externa (PDFs
   antiguos, correos, reportes ya impresos) queda con el número viejo.

## Cambios

### A. Migración SQL (Supabase)

Archivo nuevo: `supabase/migrations/20260930120000_rename_receipt_format_drop_year.sql`

Operaciones (idempotencia parcial, asume que la migración inicial de SPEC 09 está aplicada):

- Reasignar `receipt_serial` con `ROW_NUMBER()` particionado por `direction`
  y por orden `issue_date`, `created_at`, `id` para preservar el orden histórico.
- Reemplazar la columna generada `receipt_number` con la fórmula
  `(case when direction = 'INGRESO' then 'RI' else 'RE' end) || '-' || lpad(receipt_serial::text, 6, '0')`.
- Eliminar la columna `receipt_year` y la constraint
  `payment_receipt_unique(direction, receipt_year, receipt_serial)`; recrearla
  como `(direction, receipt_serial)`.
- Cambiar la PK de `receipt_sequence` a solo `direction`, truncar la tabla y
  repoblarla con `MAX(receipt_serial)` por dirección.
- Reemplazar `private.next_receipt_serial(p_direction)` (sin parámetro de año)
  y `private.assign_receipt_number()` (ya no escribe `receipt_year`).
- Recrear el trigger `payment_assign_receipt` apuntando a la nueva función.

### B. Código TypeScript

- `components/pagos/types.ts` (líneas 11, 13, 35): actualizar comentarios.
- `lib/supabase/types.ts`: quitar la propiedad `receipt_year` de
  `payment.Row/Insert/Update` y de `receipt_sequence.Row/Insert/Update`.

### C. Tests

- `tests/components/payment-history-section.test.tsx`: 4 strings
  (`"RI-2026-000001"` → `"RI-000001"`, `"RI-2026-000002"` → `"RI-000002"`).
- `tests/unit/lib/pagos/pagos.test.ts`: 3 strings en `paymentRow` y
  expectations (incluyendo `receipt_number` en filas de prueba).
- `tests/unit/lib/pagos/cartera.test.ts`: 2 strings en `paymentRow` y filas
  relacionadas.

### D. Spec

- `specs/09-pagos-y-recibos.md`: actualizar las secciones
  `Scope`, `Data model`, `Implementation plan`, `Acceptance criteria`,
  `Decisions` y `Risks` para reflejar el nuevo formato y la renumeración.

## Riesgos y mitigaciones

| Riesgo | Mitigación |
| --- | --- |
| Renumerar rompe referencias externas (PDFs, correos previos) | Aceptado por el usuario; comunicado en el mensaje final. |
| DROP COLUMN sobre columna generada usada por el trigger | El trigger se elimina antes de tocar la columna y se recrea después. |
| Renumeración podría chocar con la unique constraint durante el UPDATE | La constraint actual incluye `receipt_year`, así que no hay colisión; la nueva `(direction, receipt_serial)` se aplica al final, después de la reasignación. |
| `ROW_NUMBER()` necesita un orden estable para empates | Orden secundario por `created_at, id` para determinismo. |
| Regeneración de tipos requiere Supabase CLI (no disponible en este entorno) | Editar manualmente `lib/supabase/types.ts` con el cambio mínimo; recordatorio al usuario. |

## Evidencia de cierre

- `npm run lint` pasa.
- `npm test` pasa (los 3 archivos modificados + resto).
- `npm run build` pasa.
- Archivo de migración SQL entregado al usuario para aplicar manualmente
  (no se pudo aplicar vía MCP en este entorno).