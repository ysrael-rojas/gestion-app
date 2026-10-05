# SPEC 18 — Anticipos sin cliente y asignación tardía de saldo

> **Status:** Draft
> **Depends on:** SPEC 09, SPEC 10, SPEC 13, SPEC 17
> **Date:** 2026-10-05
> **Objective:** Permitir registrar un anticipo sin entidad (cliente/proveedor) y asignarlo después a una entidad y una o varias facturas, mostrando "—" en toda la UI donde no haya nombre de entidad.

## Why this spec exists

Hoy el formulario de pago exige entidad y el esquema lo refuerza (`payment.entity_id NOT NULL`). El usuario necesita registrar anticipos sin contraparte (cobros/pagos genéricos de inicio de período o de caja menor) y ya decidió que el flujo correcto es: registrar el anticipo sin entidad, luego asignarlo a un cliente/proveedor y a sus facturas con saldo desde el detalle del pago. Asignar el saldo a una factura sin entidad implica setear la entidad del pago en ese momento (la asignación exige `v_entity <> v_payment_entity` falso, es decir, entidades iguales). La UI actual también resuelve nombres de entidad solo contra la lista de clientes (en egresos muestra "Entidad no encontrada" para proveedores): este fix de resolución de nombre es prerrequisito natural para mostrar "—" y llega en esta misma spec.

## Scope

**In:**

- Migración `make_payment_entity_nullable`:
  - `alter table public.payment alter column entity_id drop not null` (la FK con `entidad(id)` se conserva: `NULL` es un valor válido para una FK).
  - Recreación de `private.validate_allocation` con un guard explícito: si el pago no tiene entidad, la asignación directa por SQL se rechaza.
- Regeneración de `lib/supabase/types.ts` (`entity_id` pasa a ser `string | null`).
- `lib/schemas/payment.ts`: `entityId` pasa a ser opcional; si no hay entidad, `allocations` debe ser vacío (un anticipo sin entidad no puede traer asignaciones); si hay asignaciones, la entidad es obligatoria (recibida implícitamente por el picker).
- `components/pagos/payment-form.tsx`: campo "Cliente/Proveedor" opcional con hint "Sin entidad, el pago queda como anticipo sin asignar".
- `lib/pagos/pagos.ts`: `createPayment` envía `p_entity_id = null` cuando no hay entidad; `addAllocations` acepta `entityId` y, si `payment.entity_id` está vacío, hace primero `update payment set entity_id = ...` antes de insertar asignaciones.
- `components/pagos/payment-detail-modal.tsx`: en un pago sin entidad, **Asignar saldo** abre primero un paso de selección de entidad (clientes si INGRESO, proveedores si EGRESO reutilizando `useClientes()` y `listSuppliers()`), y luego el `allocation-picker` de siempre.
- Función compartida de resolución de nombre de entidad (null → "—"), usada por `payments-view.tsx`, `payments-columns.tsx`, `payment-detail-modal.tsx` y `receipt-dialog.tsx`. Corrige de paso el bug de proveedores invisibles en egresos (hoy solo se busca en `clients`).
- `lib/pagos/cartera.ts` y la vista de cartera (SPEC 10): anticipos sin entidad se listan con nombre "—".
- Tests unitarios actualizados: schema de pago (entidad opcional + refinamiento), mapper de `cartera.ts` con `entity_id` null, `addAllocations` seteando entidad.

**Out of scope (for future specs):**

- Re-cambiar la entidad de un pago ya asignado (una vez asignado, el pago queda ligado a esa entidad).
- Anticipos "genéricos" etiquetados o con más campos libres (referencia/nota siguen existiendo).
- Integración con `cash_account` o cualquier puente entre pagos y las cajas/bancos de la app.
- Edición de pagos registrados.
- RPC transaccional para `addAllocations` (mantiene el riesgo conocido de SPEC 13; aquí sigue siendo UI orquestada).
- Doble submit del modal, decimales del schema, picker con errores tragados, e2e roto (spec de calidad futura).

## Data model

Migración `make_payment_entity_nullable` vía MCP `apply_migration`:

```sql
-- payment.entity_id pasa a admitir NULL (anticipo sin contraparte).
alter table public.payment alter column entity_id drop not null;
comment on column public.payment.entity_id is
  'Entidad del pago. NULL = anticipo sin asignar a cliente/proveedor aún.';
```

La FK `references public.entidad (id)` no cambia (una FK admite `NULL`): un pago sin entidad simplemente no apunta a nadie.

Recreación de `private.validate_allocation` (mismo cuerpo y flags de SPEC 09, con el guard nuevo indicado):

```sql
create or replace function private.validate_allocation() returns trigger
language plpgsql security definer set search_path = ''
as $$ ... $$
-- Cuerpo idéntico al de specs/09-pagos-y-recibos.md con UN cambio en la
-- resolución de v_payment_entity:
--   select p.entity_id, p.direction into v_payment_entity, v_direction
--     from public.payment p
--    where p.id = new.payment_id;
-- e inmediatamente después del lookup del comprobante:
--   if v_payment_entity is null then
--     raise exception 'El pago no tiene entidad asignada todavía';
--   end if;
```

Sin ese guard, `v_entity <> v_payment_entity` con `v_payment_entity = NULL` evalúa `NULL` (no `true`) y la comparación no rechazaría la asignación: se crearía una asignación contra un pago sin entidad en un estado inconsistente. El guard hace explícito el rechazo y obliga a pasar por el flujo de la app (`addAllocations`), que setea la entidad primero.

Tipos y firmas en UI afectados:

```ts
// components/pagos/types.ts
export interface Payment {
  id: string;
  entityId: string | null;   // era string — null = anticipo genérico
  // ... resto igual
}

// lib/schemas/payment.ts
const paymentSchema = z.object({
  entityId: z.string().uuid().optional(),   // era obligatorio
  direction: z.enum(["INGRESO", "EGRESO"]),
  // ... resto igual
}).superRefine((values, ctx) => {
  // validación existente: assignments no superan el importe
  if (values.allocations.length > 0 && !values.entityId) {
    ctx.addIssue({
      code: "custom",
      message: "Selecciona la entidad para asignar el pago.",
      path: ["entityId"],
    });
  }
});
```

Cambio en `lib/pagos/pagos.ts`:

```ts
// createPayment(values: PaymentFormValues): Promise<PaymentDetail>
//   p_entity_id: values.entityId ?? null

// addAllocations(paymentId: string, items: AllocationInput[], entityId: string): Promise<void>
//   1) select entity_id from payment where id = paymentId
//   2) si entity_id es null → update payment set entity_id = entityId
//   3) insert de asignaciones (flujo actual)
//   La entidad siempre viene del paso previo de la UI y corresponde al
//   comprobante elegido (el picker solo ofrece facturas de esa entidad).
```

## Implementation plan

1. Aplicar la migración `make_payment_entity_nullable` vía MCP `apply_migration` (con la recreación de `private.validate_allocation`); revisar advisors; verificar con `execute_sql` que `entity_id` es nullable y que una asignación directa contra un pago sin entidad es rechazada (`exception 'El pago no tiene entidad asignada todavía'`).
2. Regenerar `lib/supabase/types.ts` (`npm run gen:types`) y confirmar `npm run lint`.
3. `lib/pagos/pagos.ts`: `createPayment` envía `null`, `addAllocations` recibe `entityId` y sincroniza la entidad del pago; `components/pagos/types.ts` tipa `entityId: string | null`. Verificar `npm run lint`.
4. `lib/schemas/payment.ts`: entidad opcional + refinamiento (asignaciones exigen entidad). Verificar `npm run lint` y actualizar `tests/unit` del schema.
5. `components/pagos/payment-form.tsx`: campo de entidad opcional con hint; el resto del formulario sin cambios. Verificar el flujo en `npm run dev`: anticipo sin entidad se registra y aparece con "—".
6. Resolución de nombre compartida: helper de entidad (null → "—", con búsqueda en `clients` + `listSuppliers`) adoptado en `payments-view.tsx`, `payments-columns.tsx`, `payment-detail-modal.tsx` y `receipt-dialog.tsx`. En egresos, proveedores muestran su nombre. Verificar `npm run lint`.
7. `components/pagos/payment-detail-modal.tsx`: "Asignar saldo" en pagos sin entidad muestra un paso de selección de entidad con proveedor/cliente según dirección, y en submit llama `addAllocations(paymentId, items, entityId)`.
8. `lib/pagos/cartera.ts`: mapper y resumen toleran `entity_id` null; la vista de cartera lista esos anticipos con "—". Actualizar `tests/unit` de cartera.
9. Validación total: `npm run lint`, `npm test`, `npm run build` y verificación manual en `/pagos/ingresos` y `/pagos/egresos`:
   - Anticipo sin entidad (tabla "—" y recibo sin nombre).
   - Asignación tardía: detalle → Asignar saldo → elegir cliente → elegir factura con saldo → confirmar; la entidad del pago pasa a ser ese cliente y la factura baja de saldo.
   - Regresión: pagar una factura con cliente seleccionado funciona igual que hoy.

## Acceptance criteria

- [ ] `payment.entity_id` es nullable (probadable con `information_schema.columns.is_nullable = 'YES'`).
- [ ] Insertar una asignación directa por SQL sobre un pago con `entity_id IS NULL` es rechazado con el mensaje del nuevo guard de `validate_allocation`.
- [ ] El esquema zod acepta un pago sin `entityId` **y sin** asignaciones, y rechaza un pago con asignaciones y sin `entityId`.
- [ ] Registrar un anticipo sin entidad desde `/pagos/ingresos` (o `/pagos/egresos`) funciona: recibo emitido, `payment_balance.unassigned_amount = amount`, sin contraparte.
- [ ] El listado de pagos, el modal de detalle y el recibo impreso muestran "—" para pagos sin entidad.
- [ ] Un egreso a un proveedor muestra el nombre del proveedor (no "Entidad no encontrada").
- [ ] **Asignar saldo** sobre un pago sin entidad pide primero entidad (cliente para INGRESO, proveedor para EGRESO), luego facturas con saldo de esa entidad; al confirmar, `payment.entity_id` queda seteado y las asignaciones se insertan.
- [ ] Tras la asignación tardía, la factura refleja su `Pagado`/`Saldo` actualizado y pasa a PAGADO al cubrir el total (triggers intactos).
- [ ] Anticipo con entidad se comporta idéntico a hoy (regresión cubierta por el paso 9 de verificación).
- [ ] Los anticipos sin entidad aparecen en la cartera con nombre "—".
- [ ] Ya asignado un anticipo, ya no aparece en el grupo de anticipos sin entidad de la cartera.
- [ ] `npm run lint`, `npm test` y `npm run build` pasan.

## Decisions

- **Sí:** entidad opcional en `payment` en lugar de entidad placeholder ("Anticipo genérico" como fila de `entidad`): un placeholder es un dato falso que contamina la cartera, el autocomplete y las alertas.
- **Sí:** asignar el anticipo setea `payment.entity_id` con la entidad del comprobante elegido: la invariante `payment.entity_id = comprobante.entity_id` (impuesta por `validate_allocation`) se recupera en el mismo gesto, sin cambiar el validador ni relajar la regla de coincidencia.
- **Sí:** guard explícito en `private.validate_allocation` para pagos sin entidad: sin él, la comparación con `NULL` en SQL deja pasar asignaciones huérfanas y rompería la invariante.
- **Sí:** el paso de selección de entidad vive en `payment-detail-modal.tsx` (UI), y la escritura en `addAllocations` (data layer): la UI no escribe `payment` directamente, mantiene el patrón de la app.
- **Sí:** resolver nombre de entidad con la unión `clients + listSuppliers` y centralizar el helper: además de necesario para anticipos, corrige el bug preexistente de proveedores invisibles en egresos.
- **No:** permitir cambiar la entidad de un pago ya asignado: reabriría la pregunta de "re-partir" asignaciones y el validador actual lo impide; no es el caso de uso pedido.
- **No:** colocar el paso de entidad `addAllocations` en una RPC transaccional: consecuencia de la decisión de SPEC 13 (sin RPC para `addAllocations`); se anota como riesgo y, si aparece un pago a medio asignar, queda como anticipo reasignable (estado válido).
- **No:** tocar `voucher_balance` ni los triggers de estado: la invariante se mantiene por el guard, así que ninguna vista cambia.

## Risks

| Riesgo | Mitigación |
| --- | --- |
| `addAllocations` sigue siendo dos pasos sin transacción (update de entidad + inserts de asignación) | Si el update de entidad falla, no se insertan asignaciones (orden secuencial con `await`); si una asignación falla, el pago queda con entidad pero sin asignar a esa factura — estado válido y reintentable, mismo criterio de SPEC 13. |
| Inconsistencia si un pago sin entidad recibe asignación por SQL directo (MCP/env) | Guard nuevo en `private.validate_allocation` lo rechaza explícitamente con mensaje claro. |
| El combobox de entidad del paso previo de `payment-detail-modal` carga listas largas de clientes/proveedores | Se reutiliza el mismo autocomplete de `payment-form.tsx` (`entity-autocomplete`, ya shipped): mismo patrón de búsqueda/contención de rendimiento. |
| Nombre de entidad duplicado en 4+ lugares si no se centraliza | El helper compartido del paso 6 es la única vía permitida; `npm run lint` no detecta esto, así que la aceptación 6 lo revisa por código. |
| Anticipo sin entidad queda "perdido" para el usuario si nadie lo asigna | La vista de cartera (SPEC 10) los lista como saldo sin asignar con "—" y es el lugar natural donde se detectan y asignan. |

## What is **not** in this spec

- Integración pagos ↔ cajas/bancos (`cash_account`).
- Edición de pagos o cambio de entidad posterior a la asignación.
- RPC para `addAllocations`.
- Reparación del e2e de pagos.
- Corrección de los otros bugs menores (doble submit, decimales del schema, errores tragados del picker).

Cada uno de esos, si aterriza, va en su propia spec.
