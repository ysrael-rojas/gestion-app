# SPEC 45 — Drawer único de registro de pago

> **Status:** Implementado
> **Depends on:** SPEC 25, SPEC 26, SPEC 37, SPEC 41, SPEC 42
> **Date:** 2026-10-26
> **Objective:** Reemplazar el wizard de 4 drawers anidados por un único drawer lateral (50 % de pantalla, tope 40rem) con todos los campos visibles —banda de montos arriba y grid de 2 columnas— validación al enviar y la misma lógica de pago, para ventas y compras.

## Why this spec exists

Registrar un pago desde un comprobante exige hoy navegar 4 drawers apilados de 30rem (confirmar → método/cuenta → importe → detalles), donde cada paso tapa al anterior. Son 7 campos y 3 datos de resumen: caben todos a la vista en la mitad de la pantalla, con mejor jerarquía visual y sin la fricción de Continuar/Atrás.

## Scope

**In:**

1. **Nuevo `components/comprobantes/payment-drawer.tsx`** (`PaymentDrawer`) que sustituye y elimina `nested-payment-drawers.tsx`, con la **misma interfaz de props** (los 15 actuales) para que los 3 puntos de montaje no cambien: detalle de ventas, detalle de compras y botón Wallet de los listados.
2. **Un solo Drawer** (Base UI) lateral derecho, un solo overlay: ancho `50vw` en desktop con tope `40rem` (`sm:[--drawer-content-width:50vw] xl:[--drawer-content-width:40rem]`), pantalla completa en móvil. Header y footer sticky.
3. **Header compacto:** título "Registrar pago" (font-heading), badge del tipo + número del comprobante + nombre de cliente/proveedor (reemplaza el card `VoucherSummary` del paso 1).
4. **Banda superior:** `VoucherAmountsBand` (Total / Monto abonado / Saldo por pagar) con la **moneda de la cuenta elegida**.
5. **Grid de 2 columnas** (1 en móvil) con todos los campos: Fecha de pago + Importe (con **"Nuevo saldo" en vivo** debajo del importe: emerald si ≤ 0, ámbar si > 0), Método + Caja/Banco, Categoría (fija por dirección, deshabilitada, error visible si falta) + Referencia (opcional), Notas opcional a lo ancho. Badge **"Requerido"** en fecha, importe, método y cuenta (patrón SPEC 44).
6. **Validación única al enviar:** errores inline `role="alert"` bajo cada campo y foco al primero (patrón de `payment-form.tsx`). Se eliminan los botones Continuar/Atrás y el estado `step`.
7. **Footer sticky:** Cancelar (outline) a la izquierda, "Registrar pago" (clay primary) a la derecha, con "Guardando…" durante el envío.
8. **Se conserva intacto:** ids de inputs (`payment-date`, `payment-method`, `payment-account`, `payment-amount`, `payment-reference`, `payment-notes`), importe precargado con el saldo, limpieza de cuenta al cambiar de método, moneda según cuenta, categoría resuelta por `code` con error visible sin fallback, `addPayment` → RPC `create_payment_with_allocations` (1 pago → 1 comprobante), toast "Pago registrado", cierre y `onRegistered()`.
9. **Tests:** test de componente de `PaymentDrawer` (pendiente desde SPEC 37), stub actualizado en `voucher-detalle-view.test.tsx` y e2e `registrar-pago-y-ver-saldo.spec.ts` reescrito al flujo sin Continuar.

**Out of scope (for future specs):**

- Recibo automático tras pagar (se mantiene: impresión desde Historial de pagos).
- Cambios en `/pagos/*/nuevo`, `AllocationPicker` y flujo multi-comprobante/anticipos.
- Multi-asignación o pagos parciales predefinidos desde el drawer.
- Rediseño del detalle del comprobante y de `PaymentDetailModal` (asignar/anular).
- Cambios en la RPC o en el modelo de datos.

## Data model

Sin cambios en la DB ni en esquemas. Reutiliza `PaymentFormValues` (`lib/schemas/payment.ts`), catálogos de `lib/caja/caja.ts` y `PagosProvider.addPayment`. Estado interno del drawer (sin `step`):

```ts
interface PaymentDraftState {
  paymentDate: string;   // hoy por defecto
  methodId: string;
  cashAccountId: string;
  categoryId: string;    // resuelto por code, disabled en UI
  amount: string;        // precargado con el saldo
  reference: string;     // opcional, máx 60
  notes: string;         // opcional, máx 200
}
newBalance = Math.max(balance - amount, 0); // en vivo, emerald/ámbar
```

## Implementation plan

1. Crear `payment-drawer.tsx`: layout único (header / banda / grid / footer sticky), loaders de catálogos y cuentas trasladados tal cual, draft igual a `createInitialDraft` sin `step`.
2. Montajes: `voucher-detalle-view.tsx`, `ventas-listado-view.tsx` y `compras-listado-view.tsx` cambian el import (misma interfaz); eliminar `nested-payment-drawers.tsx`.
3. Validación al enviar con foco al primer `role="alert"`; hints en vivo (nuevo saldo, ayuda de cuentas vacías).
4. Test de componente de `PaymentDrawer`: render por dirección, importe precargado, error con importe > saldo, guardado con `addPayment` mockeado (incluye caso USD por cuenta).
5. Actualizar stub de `voucher-detalle-view.test.tsx` y reescribir el e2e de pago (sin "Continuar" ×3).
6. Validación final: `npm run lint` + `npm test` + `npm run build` + e2e con dev server y seed.

## Acceptance criteria

- [x] El botón "Registrar pago" (detalle de ventas/compras y Wallet de listados) abre **un solo** drawer, sin drawers apilados ni overlays extra. Verificado en navegador: un único `[data-slot="drawer-popup"]` y ningún botón "Continuar".
- [x] En desktop el drawer mide 50vw con tope 40rem; en móvil ocupa la pantalla completa. Medido en navegador (viewport 1280 → 640 px, sin desvío); en móvil el ancho base es `calc(100vw-1.5rem)`.
- [x] Todos los campos son visibles sin scroll horizontal; la banda de montos arriba muestra la moneda de la cuenta elegida. Verificado en navegador y test de componente (caso cuenta USD).
- [x] El importe viene precargado con el saldo y el "Nuevo saldo" cambia en vivo (emerald al saldarse, ámbar si queda pendiente). Verificado en navegador (118 → 0.00) y en tests.
- [x] Al enviar sin fecha/método/cuenta: error rojo bajo el campo y foco al primero; importe 0 o mayor al saldo no registra. Cubierto por tests de componente (incluye foco al primer `role="alert"`) y verificado en navegador con método y cuenta faltantes.
- [x] "Registrar pago" guarda vía la RPC, muestra el toast "Pago registrado", cierra el drawer y refresca banda, tabs, historial y listado sin recargar la página. Verificado en navegador con una venta temporal (el listado pasó a "Pagado"); los datos de prueba se eliminaron después.
- [x] Cambiar de método limpia una cuenta incompatible; la categoría queda fija y visible, con error visible si falta. Cubierto por la lógica trasladada y el test de flujo con método Efectivo/Transferencia.
- [x] El flujo EGRESO (compras) funciona igual con sus labels de proveedor. Cubierto por `payment-drawer.test.tsx` (Proveedor + categoría `PAGO_PROVEEDOR`).
- [x] No aparece el recibo automáticamente tras registrar. El drawer no monta `ReceiptDialog`.
- [x] `registrar-pago-y-ver-saldo` (e2e) pasa con los nuevos selectores; lint, tests y build en verde. El e2e se actualizó al flujo sin "Continuar" y el flujo equivalente (abrir drawer, validar, seleccionar método/cuenta, registrar, ver "Pagado") se ejecutó en verde con una venta temporal para no tocar las ventas reales. 486 tests, lint y build OK.

## Decisions

- **Sí:** todo visible de una vez, sin pasos (elección del usuario). **No:** stepper dentro del drawer.
- **Sí:** banda de montos arriba + grid ancho. **No:** rail lateral de resumen (descartado por el usuario; habría replicado la página `/pagos/nuevo`).
- **Sí:** 50vw con tope 40rem. **No:** 50 % exacto (pantallas grandes) ni ancho fijo.
- **Sí:** validación al enviar con foco al primer error (patrón existente de `payment-form`). **No:** validación por panel de SPEC 25.
- **Sí:** sin recibo automático. **No:** abrir el recibo tras pagar.
- **Sí:** mantener los ids de los inputs. **No:** renombrarlos (minimiza el impacto en e2e y la memoria muscular).
- **Sí:** archivo y componente nuevos (`payment-drawer.tsx` / `PaymentDrawer`) y baja del archivo viejo. **No:** refactor in place.
- **Sí:** badges "Requerido" y tokens clay existentes; el elemento memorable es la banda con el saldo vivo y el CTA clay. **No:** paleta nueva, cards anidadas idénticas, numeración de pasos, eyebrows o animaciones extra.

## Risks

| Riesgo | Mitigación |
| --- | --- |
| El e2e depende del seed (venta PENDIENTE con saldo y caja sin cierre que cubra hoy) | Igual que hoy; el spec del e2e lo documenta. |
| Catálogos cargan async con el drawer abierto (selects vacíos un instante) | Igual que hoy: placeholder "Seleccionar"; sin fallback silencioso de categoría (SPEC 37). |
| 50vw en ventanas medianas estrecha el grid | El grid colapsa a 1 columna en móvil; entre sm y xl hay más ancho que los 30rem actuales. |

## What is **not** in this spec

- Recibo automático tras pagar.
- Multi-asignación desde el drawer (1 pago → 1 comprobante).
- Cambios en `/pagos/nuevo`, `AllocationPicker` o `PaymentDetailModal`.
- Cambios de esquema o RPC.

Cada uno de esos, si llega, va en su propia spec.
