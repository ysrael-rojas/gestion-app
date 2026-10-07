# SPEC 26 — Recibos de ingreso/egreso: ciclo de vida, filtros y asignación interactiva

> **Status:** Aprobado
> **Depends on:** SPEC 09, SPEC 17, SPEC 23, SPEC 25
> **Date:** 2026-10-07
> **Objective:** Reestructurar los recibos en BD con un ciclo de vida "En revisión"/"Procesado" (eliminando la fecha de emisión), agregar filtros de fecha y estado a los listados de ingresos/egresos con una columna combinada Método pago/Entidad, y renovar el registro de pagos con defaults "Seleccionar" y una asignación interactiva con Auto-distribuir.

## Why this spec exists

SPEC 09 modeló el recibo con `issue_date` propia y estado `REGISTRADO/ANULADO`. El negocio ya no separa fecha de emisión y fecha de pago (hoy nadie la edita ni la valida), y el ciclo de vida real del recibo pasa por una revisión previa a la conciliación con caja/banco que llegará más adelante. Además, la asignación manual del importe (`allocation-picker.tsx`) obliga a repartir a pulso: para un cliente con varias facturas vencidas hay que marcar cada una a mano. Esta spec alinea la BD con el ciclo de vida "En revisión/Procesado" y convierte la asignación en una experiencia asistida (monto a aplicar en vivo + auto-distribución por antigüedad).

## Scope

**In:**

- Migración de BD: `payment_status` pasa de `('REGISTRADO','ANULADO')` a `('EN_REVISION','PROCESADO','ANULADO')`; `payment.issue_date` se elimina (drop); recreación de funciones/vistas/RPC que referencian el valor viejo o la columna; default del estado en `EN_REVISION`.
- Migración de datos: los pagos `REGISTRADO` existentes pasan a `EN_REVISION` (el rename del valor del enum lo hace de facto).
- Regenerar `lib/supabase/types.ts`.
- Listados de `/pagos/ingresos` y `/pagos/egresos`: filtros de fechas (Desde/Hasta, sobre `paymentDate`) y filtro de estado con 3 valores — "Todos" (visual, no filtra), "En revisión", "Procesado" — siguiendo el patrón `ListingsToolbar` + searchParams de ventas/compras.
- DataTable de pagos: columna combinada "Método pago/Cliente" (ingresos) y "Método pago/Proveedor" (egresos) en una sola celda; columna Estado con badge de los valores nuevos; se elimina la columna "Fecha emisión".
- Badge de estado de recibo nuevo (`receipt-status-badge.tsx`) para "En revisión"/"Procesado"/"Anulado".
- Modal de detalle y recibo imprimible: quitar la fila "Emisión"; el recibo muestra solo "Fecha de pago".
- Formulario de registro (`payment-form.tsx`): Método, Caja/Banco y Categoría sin auto-seed, placeholder "Seleccionar"; quitar los `useEffect` de precarga de la primera opción.
- Asignación interactiva en `allocation-picker.tsx`: label "Monto a aplicar: $X" en vivo (sigue el campo Importe), botón "Auto-distribuir" (cubre las deudas más antiguas primero), montos manuales editables y label "Saldo sin asignar" (ya existe, se conserva).
- Regla de listado de adeudos: la lista de comprobantes pendientes del cliente/proveedor aparece solo si se ingresó la entidad; categoria "Cobranza de venta"/"Pago a proveedor" es su caso de uso principal (simétrico en egresos).
- Helper puro y testeable para la auto-distribución (`lib/pagos/auto-distribuir.ts`).
- Actualizar los tests unitarios/componentes afectados por el cambio de estados y la nueva lógica.

**Out of scope (for future specs):**

- Conciliación de caja/banco y estado de cuenta que marca el recibo como "Procesado": por ahora **ninguna acción de UI** cambia a `PROCESADO` (se puede setear manual en BD si hace falta).
- Modificar el drawer anidado de SPEC 25: registra con el default `EN_REVISION` y no cambia.
- Anulación masiva, edición de pagos, o re-ciclar un recibo de `ANULADO`.
- Filtros/orden en servidor, pagos recurrentes, intereses o notas de crédito.
- Impresión o vista previa nueva del recibo (solo se ajusta la fila de fecha existente).

## Data model

Migración `payment_lifecycle_en_revision_processed` vía MCP `apply_migration`:

```sql
alter type public.payment_status rename value 'REGISTRADO' to 'EN_REVISION';
alter type public.payment_status add value 'PROCESADO' after 'EN_REVISION';

alter table public.payment alter column status set default 'EN_REVISION';
alter table public.payment drop column issue_date;
```

Posterior a la migración, **buscar con `execute_sql` los cuerpos de funciones y RPC** (`pg_proc.prosrc`) que contengan los literales `'REGISTRADO'` o `issue_date` y recrearlas con `'EN_REVISION'` (el rename del enum no reescribe el texto fuente de las funciones). Candidatos conocidos:

- `private.validate_allocation` y `private.refresh_comprobante_status` (filtran `p.status = 'REGISTRADO'`).
- RPC `create_payment_with_allocations` (si toca `issue_date` o `status`).
- Verificar que `payment_balance`, `voucher_balance` y los triggers no mencionen columnas/valores caídos.

Tipos de UI en `components/pagos/types.ts`:

```ts
export type PaymentStatus = "EN_REVISION" | "PROCESADO" | "ANULADO";

export interface Payment {
  // ...igual que hoy, SIN issueDate
  paymentDate: string;   // única fecha del recibo
}
```

Opciones de UI en `lib/data/payment-options.ts`: `PAYMENT_STATUSES` = `EN_REVISION` → "En revisión", `PROCESADO` → "Procesado", `ANULADO` → "Anulado".

Helper puro de auto-distribución en `lib/pagos/auto-distribuir.ts`:

```ts
export function distributeOldestFirst(
  vouchers: VoucherBalance[],   // comprobantes con saldo
  amountToApply: number
): Map<string, number>;
// ordena por fecha (effectiveDueDate ?? issueDate) ascendente, asigna
// min(balance, restante) a cada uno; el excedente no se asigna
```

La fila de datatables de pagos cumple `{ paymentDate, status }`; el filtro de estado de pagos compara `payment.status` contra `EN_REVISION`/`PROCESADO` (ver plan para la generalización de `lib/filters/listado-filters.ts`).

## Implementation plan

Organizado en fases para trabajo multiagente en paralelo. **La fase A es prerrequisito de B y C; B y C son independientes entre sí y corren en paralelo con un agente cada una. La fase D es la integración final.**

**Fase A — BD y contratos (agente único, primero):**

1. Aplicar la migración `payment_lifecycle_en_revision_processed` (SQL del data model) con `apply_migration`; confirmar con `execute_sql` que `payment.issue_date` no existe, el enum tiene los 3 valores y el default es `EN_REVISION`.
2. Con `execute_sql`, buscar `prosrc` con `'REGISTRADO'` ó `issue_date` y recrear (mismo nombre, `create or replace`) `private.validate_allocation`, `private.refresh_comprobante_status`, la RPC `create_payment_with_allocations` y cualquier otra función hallada, con los literales actualizados. Revisar advisors de seguridad y rendimiento.
3. Regenerar `lib/supabase/types.ts` (`npm run gen:types`) y actualizar `components/pagos/types.ts` (estado nuevo, sin `issueDate`) y `lib/data/payment-options.ts`. Ajustar `lib/pagos/pagos.ts`: quitar el mapeo de `issue_date`, ordenar `listPayments` y el historial por `payment_date desc`. `npm run lint`.

**Fase B — Listados (agente en paralelo, depende de A):**

4. Generalizar `lib/filters/listado-filters.ts` para aceptar el campo de fecha a comparar y un matcher de estado (comprobantes usan `issueDate`+PAGADO/PENDIENTE; pagos usan `paymentDate`+EN_REVISION/PROCESADO), sin romper el uso actual en ventas/compras.
5. Adaptar la toolbar de `components/shared/listings-toolbar.tsx` (o crear la variante `payments-toolbar.tsx`) para pagos: Desde/Hasta sobre fecha de pago y Select de estado "Todos" (visual) / "En revisión" / "Procesado". Conectar searchParams `desde`/`hasta`/`estado` en las páginas de `/pagos/ingresos` y `/pagos/egresos` (params son `Promise` en Next 16).
6. Crear `components/pagos/receipt-status-badge.tsx` (Badge outline: En revisión ámbar, Procesado verde, Anulado rojo) y actualizar `payments-columns.tsx`: quitar "Fecha emisión", unir Método + Entidad en una sola celda con el título "Método pago/Cliente" (ingresos) / "Método pago/Proveedor" (egresos), columna Estado con el badge nuevo. `npm run lint`.
7. Actualizar `payment-detail-modal.tsx` (quitar fila "Emisión"; botón "Anular" visible para `EN_REVISION` **y** `PROCESADO`) y `receipt-dialog.tsx` (recibo con única fila "Fecha de pago"). `npm run lint`.

**Fase C — Registro y asignación interactiva (agente en paralelo, depende de A):**

8. En `payment-form.tsx` eliminar los 3 `useEffect` de auto-seed (método, caja, categoría) y dejar placeholder "Seleccionar" en Método, Caja/Banco y Categoría.
9. Extraer la lógica de distribución a `lib/pagos/auto-distribuir.ts` (`distributeOldestFirst`, puro) con tests unitarios del algoritmo: cubre las deudas más antiguas primero, respeta saldos y deja el excedente sin asignar.
10. Renovar `allocation-picker.tsx`: banda "Monto a aplicar: $X" en vivo (derivada del campo Importe con `watch` de react-hook-form), botón "Auto-distribuir" que corren el helper y pinta las filas, inputs manuales de monto por comprobante (clamp al saldo), y la banda "Saldo sin asignar" con feedback de color (verde cuando queda en 0). La sección exige entidad: sin entidad elegida muestra el mensaje de que hay que ingresar el cliente/proveedor (comportamiento actual, se refuerza). `npm run lint`.
11. Verificar el flujo manual: categoría "Cobranza de venta" (ingresos) o "Pago a proveedor" (egresos) lista los comprobantes pendientes de la entidad; el pago se registra con estado "En revisión".

**Fase D — Integración y verificación final:**

12. Actualizar tests que rompieron por el cambio (unit de `lib/pagos`/`lib/schemas`, y si corresponde el test de componente de `PaymentStatusBadge`, que es de comprobantes y no debe cambiar). `npm test`.
13. Caminar con `npm run dev`: filtros de fecha/estado en ambos listados, columna combinada, registro con Auto-distribuir manual y automático, caso excedente → saldo sin asignar, caso sin entidad → mensaje. Validación global: `npm run lint` + `npm test` + `npm run build` en verde.

## Acceptance criteria

- [ ] El enum `payment_status` tiene los valores `EN_REVISION`, `PROCESADO` y `ANULADO`; `payment.status` tiene default `EN_REVISION` y la columna `issue_date` ya no existe.
- [ ] Los pagos que estaban con valor `REGISTRADO` figuran como `EN_REVISION` tras la migración.
- [ ] Insertar un pago nuevo (formulario o drawer de SPEC 25) lo crea con estado `EN_REVISION`; no existe en la UI ninguna acción que lo cambie a `PROCESADO`.
- [ ] `npm run gen:types` no referencia `issue_date` ni `REGISTRADO` en `payment`.
- [ ] Las funciones privadas y la RPC `create_payment_with_allocations` operan con `EN_REVISION`: una asignación de un pago en revisión descuenta saldo del comprobante igual que antes.
- [ ] Anular un recibo "En revisión" o "Procesado" pide motivo y mantiene el comportamiento actual de liberar asignaciones.
- [ ] `/pagos/ingresos` y `/pagos/egresos` muestran los filtros Desde/Hasta sobre la fecha de pago: filtrar Desde=1/10 filtra las filas del mes y "Limpiar filtros" las restaura.
- [ ] El filtro de estado tiene exactamente 3 opciones: "Todos" (muestra todo, incluidos Anulados), "En revisión" y "Procesado"; estas dos últimas filtran contra la BD.
- [ ] Los filtros viven en la URL (`desde`/`hasta`/`estado`) y compartan la página guarda la selección al volver atrás.
- [ ] El datatable de pagos ya no tiene la columna "Fecha emisión".
- [ ] Existe una sola columna con Método y Entidad juntas, titulada "Método pago/Cliente" en ingresos y "Método pago/Proveedor" en egresos.
- [ ] La columna Estado usa un badge: ámbar "En revisión", verde "Procesado", rojo "Anulado".
- [ ] El modal de detalle no muestra fila "Emisión"; el recibo imprimible muestra única fecha "Fecha de pago".
- [ ] Al abrir el formulario de registro, Método, Caja/Banco y Categoría están vacíos con placeholder "Seleccionar"; ningún efecto los precarga.
- [ ] La sección de asignación solo lista comprobantes pendientes después de ingresar el cliente/proveedor; sin entidad muestra un mensaje que lo indica.
- [ ] Con categoría "Cobranza de venta" + cliente ingresado se listan todos los comprobantes de venta PENDIENTES (simétrico con "Pago a proveedor" y compras en egresos).
- [ ] Escribir en Importe actualiza en vivo el label "Monto a aplicar: $X".
- [ ] El botón "Auto-distribuir" asigna automáticamente el Monto a aplicar cubriendo primero los comprobantes más antiguos; con importe mayor a la suma de deudas, el sobrante queda como "Saldo sin asignar".
- [ ] Los montos por comprobante se pueden ajustar manualmente después del auto-distribuir y no pueden superar el saldo del comprobante.
- [ ] El label "Saldo sin asignar" se recalcula en vivo y queda en 0 (verde) cuando las asignaciones cubren el Monto a aplicar.
- [ ] Registrar un pago con asignaciones persiste las filas en `payment_allocation` y actualiza Pagado/Saldo de los comprobantes sin recargar.
- [ ] `npm run lint`, `npm test` y `npm run build` pasan.

## Decisions

- **Sí:** 3 estados en BD (`EN_REVISION`, `PROCESADO`, `ANULADO`) — elección del usuario; la anulación queda como acción separada aplicable a recibos en revisión o procesados.
- **Sí:** sin acción de UI para `PROCESADO` en esta spec — decisión del usuario: el paso a Procesado llegará con la conciliación de caja y estado de cuenta bancario (spec futura); hoy nada marca `PROCESADO` desde la aplicación.
- **Sí:** el saldo de comprobantes se descuenta con recibos en **cualquier** estado no anulado — decisión del usuario; `EN_REVISION` cuenta como abono aplicado igual que hacía `REGISTRADO`. Es lo que evita tocar las vistas y triggers.
- **Sí:** dropear `issue_date` — elección del usuario; la fecha única del recibo es `payment_date`, y el listado/historial pasan a ordenar por ella.
- **Sí:** migrar datos existentes `REGISTRADO` → `EN_REVISION` vía rename del valor del enum (los recibos previos quedan pendientes de conciliar).
- **Sí:** título de columna por módulo: "Método pago/Cliente" en ingresos, "Método pago/Proveedor" en egresos — decisión del usuario.
- **Sí:** comportamiento simétrico en egresos: "Pago a proveedor" lista comprobantes de compra pendientes con el mismo mecanismo de asignación — decisión del usuario.
- **Sí:** el excedente del Auto-distribuir queda como saldo sin asignar (anticipo) — decisión del usuario; coincide con el flujo ya existente de recibos sin asignar.
- **Sí:** reutilizar el patrón de filtros de ventas (`ListingsToolbar` + `applyListadoFilters` + searchParams) generalizándolo para pagar el campo de fecha y el matcher de estado, en lugar de duplicar lógica de filtrado.
- **Sí:** extraer la distribución a `lib/pagos/auto-distribuir.ts` como función pura (EN camelCase `distributeOldestFirst`) para poder testearla unitariamente sin UI.
- **Sí:** quitar el auto-seed de las cats solo del formulario completo (`payment-form.tsx`); el drawer de SPEC 25 ya usa "Seleccionar" y su categoría sigue deshabilitada.
- **No:** modificar la RPC para que valide contra `PROCESADO`: con las decisiones de arriba, `EN_REVISION` reemplaza literal por literal los usos de `REGISTRADO`.
- **No:** changefeed/realtime ni botones de transición de estado en esta spec.

## Risks

| Riesgo | Mitigación |
| --- | --- |
| `alter type ... rename value` no reescribe los cuerpos fuente de funciones/triggers/RPC que comparan `'REGISTRADO'` | Post-migración se buscan los `prosrc` con `execute_sql` y se recrean todas las funciones afectadas (paso 2); validación de advisors. |
| El default textual `'REGISTRADO'::payment_status` en la columna tras el rename | El paso 1 fija explicitamente `set default 'EN_REVISION'`. |
| Generalizar `applyListadoFilters` puede romper ventas/compras (spec 23/25 dependen de él) | Se conserva la firma actual como default (`issueDate` + estados de comprobante) y se agregan parámetros opcionales; `npm test` y smoke de ventas/compras tras el paso 4. |
| La vista `vouchersTable` y el filtro "sin-asignar"/"vencidas" (searchParams legacy de pagos) pueden confundirse con el filtro de estado nuevo | El filtro nuevo usa params `estado`; los legacy (`pendientes`, `vencidas`, `sin-asignar`) quedan intactos por compatibilidad. |
| Auto-distribuir con montos decimales puede dejar diferencias de centavos por redondeo | `distributeOldestFirst` trabaja con 2 decimales (`Math.round(x * 100) / 100`) y el último comprobante recibe el remanente exacto. |
| Dropear `issue_date` afecta reportes o tests que ya no cubre esta spec | Punto de la fase D revisa `npm test`; el admin puede re agregar la columna vía migración si aparece un consumo inesperado. |
| Dos agentes (B y C) tocan `payments-columns.tsx` / actualizan `pagos.ts` en simultáneo | Reparto explícito: B toca listados/columnas/filters; C solo `payment-form`, `allocation-picker` y `lib/pagos/auto-distribuir.ts`. Sin overlap de archivos. |

## What is **not** in this spec

- Conciliación de caja/banco y flujo que marca un recibo como "Procesado" (spec futura).
- Cualquier cambio en el drawer anidado de registro de pago de SPEC 25.
- Edición de pagos, re-ciclaje de anulados o notas de crédito.
- Página de estadísticas o reportes por estado de recibo.
- Filtros, orden o paginación en el servidor.

Cada uno de esos, si aterriza, va en su propia spec.
