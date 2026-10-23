# SPEC 42 — Página dedicada para registrar pagos (ingresos y egresos)

> **Status:** Implementado
> **Depends on:** SPEC 09, SPEC 25, SPEC 37
> **Date:** 2026-10-22
> **Objective:** Registrar pagos de ingresos y egresos en una página dedicada de dos columnas con resumen en vivo del reparto, reemplazando el modal actual.

## Why this spec exists

El botón "Registrar pago" de `/pagos/ingresos` y `/pagos/egresos` abre `PaymentModal`: un Dialog `sm:max-w-2xl` con `max-h-[90vh]` que apila las secciones "Datos del pago" y "Asignación" con scroll interno. El usuario pidió el 2026-10-22 un flujo de página completa con la información reorganizada. El wizard `NestedPaymentDrawers` de ventas/compras se maneja en otra sesión y esta spec no lo toca.

## Scope

**In:**

1. Rutas nuevas `app/(app)/pagos/ingresos/nuevo/page.tsx` y `app/(app)/pagos/egresos/nuevo/page.tsx`: server components con `PageProps`, leen `searchParams` (`entityId`, `comprobanteId`) y renderizan el mismo componente client con `direction` fija ("INGRESO" / "EGRESO").
2. Componente client nuevo `components/pagos/payments-create-view.tsx`: dos columnas (≥lg). Izquierda: campos del pago. Derecha sticky: `AllocationPicker` y panel de resumen en vivo. Barra de acciones con "Cancelar" (volver al listado) y "Registrar" (submit vía `PAYMENT_FORM_ID`).
3. Refactor de `components/pagos/payment-form.tsx`: campos y sección "Asignación" se separan en secciones componibles para que la página los distribuya en columnas; `paymentSchema`, `PAYMENT_FORM_ID`, `EntityAutocomplete` y validaciones quedan intactos.
4. Panel de resumen en vivo (dentro de `payments-create-view.tsx`): importe, total asignado y sin asignar, calculado desde los valores observados del formulario; por comprobante marcado, saldo actual y nuevo saldo. Se recalcula al escribir o marcar comprobantes.
5. Botón "Registrar pago" de `components/pagos/payments-view.tsx`: pasa de `setModalOpen(true)` a `Link` hacia `/pagos/{ingresos|egresos}/nuevo`. Se quita el montaje de `PaymentModal` y el auto-abierto por `initialEntityId`.
6. Compatibilidad de deep links: `/pagos/ingresos?entityId=X` redirige a `/pagos/ingresos/nuevo?entityId=X` (y su espejo en egresos). La página nueva precarga entidad y comprobante como hoy hace el modal (preselección con saldo y sugerencia de importe).
7. Post-guardado: `usePagos().addPayment` → `createPayment` → RPC `create_payment_with_allocations` sin cambios. Éxito: `toast` "Pago registrado" y `router.replace` al listado correspondiente con el pago visible.
8. `components/pagos/payment-modal.tsx` se elimina al quedar sin usos. `PaymentDetailModal` y `ReceiptDialog` siguen como modales.
9. Migración del e2e `tests/e2e/validacion-reparto-en-vivo.spec.ts`: navega a la página nueva en lugar de `getByRole("dialog")`; la validación inline "El reparto supera el importe del pago" (SPEC 37) se prueba igual.

**Out of scope (for future specs):**

- El wizard `NestedPaymentDrawers` de ventas y compras (botón Wallet): se maneja en otra sesión.
- `PaymentDetailModal` (ver/asignar/anular) y `ReceiptDialog`: siguen como modales.
- Cambios de esquema, vistas, triggers o RPC: `create_payment_with_allocations` intacta.
- Registro consecutivo de varios pagos sin volver al listado.
- Entradas nuevas en el navbar.
- Aplicar el patrón de página a otros módulos (clientes, ventas, compras).

## Data model

No introduce estructuras de datos nuevas. Reutiliza `paymentSchema` (`lib/schemas/payment.ts`), `AllocationInput`/`VoucherBalance` (`components/pagos/types.ts`), `distributeOldestFirst` (`lib/pagos/auto-distribuir.ts`) y `usePagos().addPayment` (`components/pagos/pagos-provider.tsx`). Solo hay estado de UI, no persistido:

```ts
// searchParams de la página nueva (server → client)
entityId?: string;        // precarga Cliente/Proveedor
comprobanteId?: string;   // preselecciona el comprobante y sugiere su saldo

// Resumen en vivo derivado del formulario
importe: number;          // amount observado
asignado: number;         // Σ allocations.amount
sinAsignar: number;       // amount − asignado
// por comprobante marcado: saldo → saldo − asignado
```

## Implementation plan

1. Refactor de `payment-form.tsx`: separar campos y asignación en secciones componibles (props/slots), manteniendo `paymentSchema`, `PAYMENT_FORM_ID` y `createEmptyValues`. Humo: el modal actual sigue funcionando con la nueva composición.
2. `components/pagos/payments-create-view.tsx`: página client de dos columnas con resumen en vivo y barra de acciones; consume `PaymentForm` compuesto. Test de componente nuevo `tests/components/payments-create-view.test.tsx`: resumen importe/asignado/sin asignar, "Auto-distribuir", preselección de `comprobanteId`, botones Cancelar/Registrar.
3. Rutas `app/(app)/pagos/ingresos/nuevo/page.tsx` y `app/(app)/pagos/egresos/nuevo/page.tsx` con `PageProps`, `searchParams` y `direction` fija por ruta.
4. `payments-view.tsx`: botón "Registrar pago" → `Link`; redirección de deep links `?entityId=` a `/nuevo`; quitar `PaymentModal` y su estado.
5. Eliminar `payment-modal.tsx` y migrar `tests/e2e/validacion-reparto-en-vivo.spec.ts` a la página nueva.
6. Validación final: `npm run lint` + `npm test` + `npm run build` (+ e2e con dev server y seed).

## Acceptance criteria

- [x] "Registrar pago" en `/pagos/ingresos` y `/pagos/egresos` navega a `/pagos/{ingresos|egresos}/nuevo`; ya no abre ningún modal. Verificado en vivo: el listado navega a la página y `getByRole("dialog")` no encuentra nada.
- [x] En desktop (≥lg) la página muestra dos columnas: campos a la izquierda, `AllocationPicker` + resumen sticky a la derecha; en pantallas menores se apilan. Verificado con Playwright a 1440×900 (`position: sticky` en el aside, resumen a la derecha) y a 390×844 (apilado con el resumen al final).
- [x] El resumen refleja en vivo importe, total asignado, sin asignar y el nuevo saldo de cada comprobante marcado. Verificado con S/ 100: importe 100, asignado 100, sin asignar 0 y Factura FF01-00004 de S/ 526 a S/ 426.
- [x] `?entityId=` precarga el Cliente/Proveedor y `?comprobanteId=` preselecciona el comprobante con su saldo, como hoy hace el modal. Cubierto por `payments-create-view.test.tsx` (importe sugerido = saldo del comprobante pedido).
- [x] Las validaciones de SPEC 37 siguen intactas: `superRefine` del schema y error inline "El reparto supera el importe del pago". Cubierto por test de componente y por el e2e migrado.
- [x] "Registrar" guarda con la misma RPC, muestra el toast "Pago registrado" y vuelve al listado con el pago visible (refresco del provider). Verificado en vivo con el anticipo `RI-000019` (S/ 1.00), anulado después para dejar la BD como estaba.
- [x] "Cancelar" y el link de volver regresan al listado sin registrar nada. Cubierto por el e2e (Cancelar vuelve a `/pagos/ingresos`) y por `BackLink` en la cabecera.
- [x] `/pagos/ingresos?entityId=X` redirige a `/pagos/ingresos/nuevo?entityId=X` (ídem egresos). Verificado en vivo, incluido `comprobanteId`.
- [x] `PaymentDetailModal`, `ReceiptDialog` y el wizard de ventas/compras funcionan sin cambios. `PaymentDetailModal` se usó en vivo para anular el pago de prueba; el wizard y el recibo conservan su código y sus tests.
- [x] El e2e `validacion-reparto-en-vivo` pasa por la página nueva. 1/1 en verde contra el dev server con el seed documentado.
- [x] `npm run lint`, `npm test` y `npm run build` pasan. 427 tests, build con las rutas `/pagos/ingresos/nuevo` y `/pagos/egresos/nuevo`.

## Decisions

- **Sí:** rutas espejo `/pagos/{ingresos|egresos}/nuevo` con dirección fija. **No:** ruta única `/pagos/nuevo?direction=` — la dirección queda en la jerarquía, consistente con la estructura actual y los `PageProps` tipados.
- **Sí:** dos columnas con columna derecha sticky (elección del usuario). **No:** wizard por pasos — ya existe en ventas y se maneja en otra sesión.
- **Sí:** volver al listado con toast tras guardar. **No:** estado de éxito en la página — equivale al cierre del modal actual.
- **Sí:** redirect de compatibilidad para deep links `?entityId=`. **No:** deprecarlos.
- **Sí:** eliminar `payment-modal.tsx`. **No:** dejar código muerto.
- **Sí:** reutilizar `PaymentForm`, `paymentSchema`, `AllocationPicker` y `addPayment`. **No:** nuevo esquema, endpoint o capa de datos.
- **Sí:** visual con tokens shadcn existentes y el panel de resumen como elemento distintivo de la página (pasó por `frontend-design`: sin eyebrows, sin etiquetas monospace, sin numbered markers, un solo momento de movimiento — los números que reaccionan al escribir). **No:** paleta nueva ni decoración adicional.

## Risks

| Risk | Mitigation |
| --- | --- |
| Primera página de creación del proyecto: sienta patrón para futuras migraciones (clientes/ventas usan modal) | Mantener la estructura simple y documentada: server + `searchParams` + client view componible |
| Refactor de `payment-form.tsx` puede romper el contrato del modal durante la transición | Paso 1 deja el modal funcional con la nueva composición antes de eliminarlo en el paso 5 |
| La columna sticky y el `AllocationPicker` largo pueden desbordar en pantallas medias | Breakpoint `lg` para dos columnas; apilado con resumen al final debajo del form en móviles |
| El e2e migrado depende del dev server y del seed | Igual que hoy: seed documentado y `test.skip` sin credenciales |

## What is **not** in this spec

- El wizard de ventas/compras (otra sesión).
- Cambios de datos, RPC o validaciones de negocio.
- `PaymentDetailModal` y `ReceiptDialog`.
- Registro consecutivo de pagos y entradas de navbar.
- Migrar otros módulos a páginas.

Cada uno de esos, si llega, va en su propia spec.
