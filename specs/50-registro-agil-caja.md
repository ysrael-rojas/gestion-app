# SPEC 50 — Registro ágil de caja (movimientos sin comprobante y arqueo de caja chica persistente)

> **Status:** Implementado
> **Depends on:** SPEC 18, SPEC 33, SPEC 37, SPEC 48, SPEC 49
> **Date:** 2026-10-27
> **Objective:** Registrar movimientos de caja que no pagan ni cobran un comprobante (aporte y retiro del propietario, gastos hormiga, abonos bancarios) desde un diálogo en Detalle de Cuentas, marcarlos para que no ensucien los listados de cobros/pagos, y persistir el arqueo de caja chica en `cash_count`.

## Why this spec exists

Dos hallazgos de la auditoría operativa del 2026-10-27 siguen abiertos:

- **F6 — no existe el "movimiento de caja" sin comprobante.** El dinero entra y sale de una caja por razones que no son cobrar una factura ni pagar una compra: el dueño aporta capital, retira para gastos personales, se paga un gasto hormiga, el banco abona intereses. Hoy esas operaciones solo se pueden registrar por el wizard de pagos (`/pagos/*/nuevo`, pensado para cobranzas con cliente y asignación a comprobantes) o por el cargo bancario, que es **solo egreso** y con tres categorías fijas. El control interno para MYPE pide explícitamente una categoría propia de "Retiro del propietario" (existe) y registrar los abonos del banco apenas se ven.
- **F5 — el arqueo de caja chica no persiste.** El input "Efectivo contado" de `petty-cash-panel.tsx` es estado local que se borra al cerrar el panel: no queda registro del conteo, ni responsable, ni fecha. SPEC 49 creó `cash_count` + `register_cash_count` para el arqueo sorpresivo, y el panel puede apoyarse en esa misma infraestructura.

Consecuencia adicional detectada al diseñar: estos recibos (y los que genera cada vale de caja chica desde SPEC 49) no tienen entidad ni asignaciones, así que en los listados de Ingresos/Egresos quedan marcados **"Por asignar" para siempre** (SPEC 48) con el botón "Asignar" visible, y entran al filtro "sin-asignar" y a los buckets de cartera. Un movimiento de caja nunca se asigna a un comprobante: hay que distinguirlo de un anticipo real.

## Scope

**In:**

1. **Bandera de movimiento de caja en el recibo.** `payment.is_cash_movement boolean not null default false`. Se fija **solo en el INSERT**: el guard `payment_guard_history_mutation` (SPEC 30) no permite actualizar otras columnas, así que no existe un "marcar después".
2. **RPC actualizada.** `create_payment_with_allocations` gana `p_is_cash_movement boolean default false` (compatible hacia atrás); `create_petty_cash_vale` marca `true` el recibo que genera (un vale no se asigna a comprobantes).
3. **Diálogo `CashMovementModal` ("Registrar movimiento")**, generalizando el patrón del cargo bancario:
   - Cuenta **preseleccionada** desde la fila (no se vuelve a elegir).
   - Tipo **Ingreso / Egreso** (segmented control, por defecto Egreso).
   - Categoría filtrada por dirección (`listCategories(direction)`, sembrada con `ensureCatalogsSeeded`).
   - Importe, referencia (opcional), notas (opcional).
   - Fecha propuesta = primer día abierto de la cuenta (`firstOpenDate` + `getLastClose`), con `min` y rechazo en cliente si cae en periodo cerrado (`isDateClosed`), igual que `BankChargeModal`. El trigger de la BD sigue siendo la última línea de defensa.
   - Envío: `createPayment` con `entityId: undefined`, `allocations: []` e `isCashMovement: true` → toast + refresh de posiciones.
4. **Botón "Movimiento" por fila en `cuentas-view.tsx`** (columna de acciones, que hoy solo pinta "Vales" en cajas chicas), para cualquier cuenta activa.
5. **Categorías semilla nuevas** en `DEFAULT_CATEGORIES` (INGRESO): `APORTE_PROPIETARIO` ("Aporte del propietario") y `ABONO_BANCARIO` ("Abono bancario"). `ensureCatalogsSeeded` las siembra por `code` también a owners con catálogo existente (comportamiento vigente de SPEC 33/37).
6. **El cargo bancario se marca como movimiento de caja**: `bankChargeToPayment` añade `isCashMovement: true`. Su modal y su acceso desde el extracto del cuadre **no cambian**.
7. **Listados limpios (SPEC 48 ajustada).** `getAssignState` gana el estado `MOVIMIENTO`: cuando `is_cash_movement` es verdadero, la columna "Saldo por asignar" muestra el badge neutro **"Movimiento de caja"** (sin monto ni "Por asignar") y el botón "Asignar" no se renderiza. `listUnassignedPayments` y `getCarteraResumen` excluyen los movimientos de caja (el filtro "sin-asignar" y la cartera siguen mostrando solo anticipos y cobros reales).
8. **Panel de caja chica con arqueo persistente.** Se **mantiene** el bloque clásico (efectivo contado + vales pendientes vs fondo fijo) y se añade:
   - Botón **"Guardar arqueo"** que abre el `CashCountModal` de SPEC 49 (grilla de denominaciones, responsable, notas) y persiste en `cash_count` vía `createCashCount`.
   - Lista de los **últimos arqueos** de la cuenta (fecha, contado, esperado, diferencia, resultado) con `listCashCounts`.
9. Tras las migraciones: regenerar `lib/supabase/types.ts` con el MCP `generate_typescript_types` (reponiendo la cabecera del repo) y versionar el SQL en `supabase/migrations/`.
10. Tests: unitarios (schema/mapper del movimiento, `getAssignState` con `MOVIMIENTO`, exclusión en cartera, `createPayment` con el flag, seeds nuevos) y de componente (diálogo de movimiento con periodo cerrado, columna del listado, panel de caja chica con guardado e historial).

**Out of scope (for future specs):**

- Atajo "Depositar excedente" en la fila (decisión del usuario: el botón global "Transferir" ya cubre el depósito; el procedimiento de depositar el excedente el mismo día queda documentado, no automatizado).
- Unificar `BankChargeModal` dentro del nuevo diálogo (se conserva; solo se marca el recibo).
- Anular o editar un movimiento desde su diálogo: se anula desde el listado de pagos, como cualquier recibo.
- Nueva tabla `cash_movement` (descartada: duplicaría saldos, extracto, cuadre, CSV, impresión y anulación).
- Cambios en `private.cash_expected_balance`, `close_cash_account` o en los estados `EN_REVISION`/`PROCESADO`/`ANULADO`.
- ITF sugerido (0,005 %), validación de periodo cerrado en el wizard de pagos y registro consecutivo: descartados por el usuario en la ronda de SPEC 49.
- **SPEC 51 (reportes y actas):** acta de arqueo imprimible con doble firma, extracto por rango arbitrario + CSV, flujo de caja proyectado y formato de conciliación bancaria.
- Multi-moneda real, `audit_log`, roles de caja, higiene RLS (`auth_rls_initplan`) y unificación de `formatAmount`/`mapError`.

## Data model

```sql
-- 1) Bandera en el recibo (se fija en el INSERT; el guard impide actualizarla)
alter table public.payment
  add column is_cash_movement boolean not null default false;

-- 2) La RPC de creación la acepta (default false: compatible con el wizard actual)
--    create_payment_with_allocations(..., p_is_cash_movement boolean default false)
--    insert into payment (..., is_cash_movement) values (..., coalesce(p_is_cash_movement, false));

-- 3) El recibo del vale de caja chica nace marcado
--    create_petty_cash_vale: insert into payment (..., is_cash_movement) values (..., true);
```

Sin backfill necesario para los vales: no hay vales ni recibos de vale en la BD (verificado en SPEC 49). Los cargos bancarios ya registrados **no** se marcan (no hay UPDATE posible por el guard); quedan como "Por asignar" y se documenta en la spec como dato histórico.

```ts
// components/pagos/types.ts
export interface Payment {
  // …campos actuales…
  isCashMovement: boolean; // true = no se asigna a comprobantes
}

// lib/pagos/asignacion.ts — estado derivado extendido
export type AssignState = "POR_ASIGNAR" | "ASIGNADO" | "ANULADO" | "MOVIMIENTO";
// MOVIMIENTO: is_cash_movement === true && status !== "ANULADO"
export const ASSIGN_STATE_LABELS: Record<AssignState, string>; // "Movimiento de caja"

// lib/schemas/cash-movement.ts — nuevo
export const cashMovementSchema = z.object({
  cashAccountId: z.string().uuid(),
  direction: z.enum(["INGRESO", "EGRESO"]),
  categoryId: z.string().uuid(),
  amount: z.coerce.number().positive(),
  movementDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reference: z.string().trim().max(60).optional(),
  notes: z.string().trim().max(200).optional(),
}); // + superRefine de fecha futura (mismo criterio que cash-count/cash-close)

// lib/caja/movimientos.ts — mapper puro, espejo de bankChargeToPayment
export function cashMovementToPayment(values: CashMovementFormValues): PaymentFormValues;
```

UI nueva: `components/cajas-bancos/cash-movement-modal.tsx`. Sin componentes de `ui/` nuevos (segmented control con `Button`/`Tabs` existentes o `Select`, a decidir en implementación).

## Implementation plan

1. Cargar `supabase-postgres-best-practices`. **Migración**: `payment.is_cash_movement` + `create_payment_with_allocations` con el parámetro nuevo + `create_petty_cash_vale` marcando `true`. Versionar el SQL en `supabase/migrations/` y regenerar `lib/supabase/types.ts` vía MCP.
2. **Plumbing de cliente**: `Payment.isCashMovement`, `createPayment` envía `p_is_cash_movement`, `listPayments` lo mapea, `getAssignState` con `MOVIMIENTO` + etiqueta, `payments-columns.tsx` (badge neutro, sin botón Asignar), `listUnassignedPayments` y `getCarteraResumen` excluyendo movimientos. Tests unitarios y de columnas.
3. **Diálogo de movimiento**: `lib/schemas/cash-movement.ts`, `lib/caja/movimientos.ts`, `CashMovementModal` (tipo, categoría, importe, fecha con periodo abierto, referencia, notas) y botón "Movimiento" por fila en `cuentas-view.tsx` con refresh. Tests de schema, mapper y componente (incluye rechazo de fecha cerrada).
4. **Categorías semilla**: `APORTE_PROPIETARIO` y `ABONO_BANCARIO` en `DEFAULT_CATEGORIES.INGRESO`; tests de `defaults.test.ts` y de `ensureCatalogsSeeded` (siembra por `code` a owners existentes).
5. **Cargo bancario + caja chica**: `bankChargeToPayment` marca `isCashMovement`; `petty-cash-panel.tsx` añade "Guardar arqueo" (abre `CashCountModal`) y el historial de `listCashCounts`, conservando el bloque clásico. Tests de `cargos.test.ts` y `petty-cash-panel.test.tsx`.
6. **Validación final**: prueba de integración en la BD con `rollback` (crear un movimiento marcado, verificar que no entra en `payment_balance`-based "sin asignar" de cartera y que un vale nace marcado), `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build` y revisión de advisors.

## Acceptance criteria

- [x] Desde Detalle de Cuentas, "Movimiento" abre un diálogo con la cuenta ya elegida y registra un recibo (`RI-…`/`RE-…`) sin entidad, sin asignaciones y con `is_cash_movement = true`, en la dirección y categoría elegidas. Test de componente del diálogo; integración en BD: flag explícito, default `false` y vale marcado.
- [x] La fecha propuesta es el primer día abierto de la cuenta; una fecha de periodo cerrado se rechaza en el cliente con mensaje claro y el trigger de la BD sigue bloqueándola. Test "rechaza una fecha dentro de un periodo cerrado".
- [x] En Ingresos/Egresos, esos recibos muestran el badge neutro "Movimiento de caja" en la columna "Saldo por asignar" y **no** tienen botón "Asignar"; un anticipo real (sin entidad, sin flag) sigue mostrando monto + "Por asignar" + botón. Tests de `getAssignState` y de columnas.
- [x] El filtro "sin-asignar" y los buckets de cartera (`getCarteraResumen`) no incluyen movimientos de caja. `listUnassignedPayments` filtra `is_cash_movement = false` y `getCarteraResumen` descarta los ids marcados; tests unitarios de ambos.
- [x] El recibo que genera un vale de caja chica nace marcado como movimiento de caja. Integración en BD con `rollback`: `create_petty_cash_vale` → `payment.is_cash_movement = true`.
- [x] El cargo bancario conserva su modal y su acceso desde el extracto, y su recibo queda marcado como movimiento de caja. `bankChargeToPayment` añade `isCashMovement: true`; tests del mapper.
- [x] "Aporte del propietario" y "Abono bancario" aparecen en el selector de categorías de ingreso, también para owners que ya tenían catálogo (siembra por `code`). Tests de `DEFAULT_CATEGORIES` y de `ensureCatalogsSeeded`.
- [x] El panel de caja chica conserva el bloque clásico (contado + vales pendientes vs fondo) y añade "Guardar arqueo", que persiste en `cash_count` con denominaciones y responsable, y muestra los últimos arqueos con su resultado. Tests del panel (historial y apertura del modal).
- [x] No cambian `private.cash_expected_balance`, `close_cash_account` ni los estados `EN_REVISION`/`PROCESADO`/`ANULADO`. Solo se tocaron las dos RPC de creación y la columna nueva.
- [x] `lib/supabase/types.ts` actualizado y **verificado contra `generate_typescript_types`** (las secciones de `payment` y `create_payment_with_allocations` coinciden con el generador); migración versionada en `supabase/migrations/`; `npx tsc --noEmit`, `npm run lint`, `npm test` (555 tests) y `npm run build` en verde; advisors revisados sin hallazgos nuevos de la columna.

## Decisions

- **Sí:** el movimiento es un `payment` con bandera. **No:** tabla `cash_movement` propia — duplicaría saldo esperado, extracto, cuadre, CSV, impresión de recibo y anulación, y obligaría a tocar `close_cash_account` y `cash_expected_balance`.
- **Sí:** bandera `is_cash_movement` en `payment`. **No:** inferirlo por categorías (frágil: el dueño crea y renombra categorías) ni dejarlo sin distinguir (ruido permanente en los listados y en la cartera).
- **Sí:** la bandera se fija en el INSERT vía RPC. **No:** actualizarla después — `payment_guard_history_mutation` (SPEC 30) bloquea cualquier otra mutación, y relajarlo rompería la inmutabilidad del historial.
- **Sí:** botón por fila en Detalle de Cuentas, con la cuenta preseleccionada. **No:** botón global que obligue a elegir cuenta, ni vivir solo dentro del cuadre.
- **Sí:** un solo diálogo con tipo Ingreso/Egreso. **No:** dos accesos separados (aporte por un lado, retiro por otro).
- **Sí:** sembrar `APORTE_PROPIETARIO` y `ABONO_BANCARIO`. **No:** obligar a usar "Otro ingreso" (pierde la lectura por categoría en el cuadre, que es justo donde el dueño revisa el resultado del mes).
- **Sí:** el cargo bancario se marca como movimiento y conserva su modal. **No:** unificarlo ahora (refactor y tests extra sin ganancia funcional).
- **Sí:** atajo de depósito, fuera. **No:** incluirlo — "Transferir" ya lo cubre y el control de depositar el excedente es un procedimiento, no una pantalla.
- **Sí:** el panel de caja chica mantiene la fórmula clásica y añade el arqueo persistido. **No:** reemplazarla — el fondo fijo es la lectura operativa del custodio; `cash_count` es la cifra auditable contra registros.
- **Pase previo por `frontend-design`** (2026-10-27): concepto "un movimiento de caja es un recibo más, no un formulario de cobranza"; cero colores nuevos; importes con `tabular-nums`; labels en sentence case; la cuenta viene de la fila; silencio donde no aplica (sin "Por asignar" en movimientos). Se mantiene conscientemente el separador `·` de las descripciones de diálogo por coherencia con `CashValeModal`/`PettyCashPanel`.
- **Corrección de implementación (2026-10-27):** el diálogo incluye un campo **Método** que el diseño original no listaba, porque `create_payment_with_allocations` lo exige. Se filtra por tipo de cuenta (Efectivo en cajas; los demás en bancos) y en una caja se preselecciona Efectivo.

## Risks

| Risk | Mitigation |
| --- | --- |
| Cambiar la firma de `create_payment_with_allocations` rompe a quien la llame sin el parámetro nuevo | Parámetro con `default false`; el wizard actual no cambia de comportamiento; tipos regenerados antes de los tests |
| La bandera no se puede corregir después (guard de SPEC 30) | Se fija en el único punto de creación (RPC); si un movimiento se registró mal, se anula y se vuelve a registrar (flujo existente) |
| Excluir movimientos de cartera oculta dinero real | La exclusión es solo por `is_cash_movement`; anticipos y cobros siguen entrando; el saldo de la cuenta (`get_cash_positions`) no cambia porque sigue sumando todos los recibos no anulados |
| Cargos bancarios y vales históricos quedan sin marcar | No hay datos históricos (0 vales); los cargos anteriores se dejan como están y se documenta; el guard impide el UPDATE |
| Sembrar categorías duplica si el dueño ya creó una igual con otro nombre/code | `ensureCatalogsSeeded` matchea por `code` estable y solo inserta lo que falta (SPEC 37); el backfill por nombre aplica solo a filas sin `code` |
| El panel de caja chica muestra "Faltante" si hay gastos no-vale | La cifra auditable pasa a ser el arqueo guardado contra registros (`cash_count`); el bloque clásico queda como referencia del fondo fijo |
| Migraciones aplicadas vía MCP sin CLI instalada | Versionar el SQL en `supabase/migrations/` y regenerar tipos con `generate_typescript_types` (camino documentado en `AGENTS.md`) |

## What is **not** in this spec

Acta de arqueo imprimible con firmas, extracto por rango libre, flujo de caja proyectado y conciliación bancaria formal (SPEC 51); tabla `cash_movement` propia; edición/anulación de movimientos desde el diálogo; depósito de excedente automatizado; ITF sugerido; multi-moneda real; `audit_log` y roles de caja. Cada uno, si llega, va en su propia spec.
