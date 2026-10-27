# SPEC 46 — Ajustes al drawer de pago: header uniforme, "Total" y selects persistentes

> **Status:** Implementado
> **Depends on:** SPEC 44, SPEC 45
> **Date:** 2026-10-27
> **Objective:** Uniformizar el header del drawer de pago (tipo, cliente y datos de emisión en un solo tamaño de letra), cambiar "Total del comprobante" por "Total" en la banda de montos y hacer persistente la opción "Seleccionar" en los selects de Método y Caja/Banco.

## Why this spec exists

El header del drawer (SPEC 45) mezcla tres tamaños (badge + número grande + línea meta en `text-xs`), la banda de montos dice "Total del comprobante" (largo para el espacio) y los selects de Método y Caja/Banco pierden la opción "Seleccionar" una vez elegido un valor — el mismo bug que SPEC 44 resolvió para el tipo de comprobante —, impidiendo volver atrás sin recargar.

## Scope

**In:**

1. **Header del `PaymentDrawer` sin badge y en tamaño uniforme** (todo `text-sm`), con labels en MAYÚSCULAS en color tenue y valores en color normal:
   - Línea 1: `FACTURA: F001-000012` — tipo en MAYÚSCULAS (label tenue) + número con `tabular-nums`.
   - Línea 2: `CLIENTE: RAZÓN SOCIAL` (o `PROVEEDOR:` en EGRESO).
   - Línea 3: `FECHA EMISIÓN: 26/10/2026` + `CONDICIÓN: Contado` + `VENCIMIENTO: 26/11/2026` **solo cuando la condición es Crédito** (con Contado el ítem de vencimiento no se muestra).
2. **`VoucherAmountsBand`:** label `"Total del comprobante"` → `"Total"` (cambio global: se ve igual en el drawer y en la banda del detalle del comprobante).
3. **Selects Método y Caja/Banco del drawer:** ítem `"Seleccionar"` con valor nulo siempre visible en la lista (patrón SPEC 44). Elegirlo limpia el campo; al limpiar el método con una cuenta incompatible elegida, la cuenta también se limpia.
4. **Tests:** actualizar `payment-drawer.test.tsx` (labels de la banda, header uniforme, placeholder persistente y limpieza) y el comentario desactualizado del e2e de pago.

**Out of scope (for future specs):**

- Fix del placeholder persistente en los demás selects de la app (`/pagos/nuevo`, serie-modal, cash-account-form, client-form).
- Cambios en los otros labels de la banda ("Monto abonado", "Saldo por pagar").
- Cambios en la página `/pagos/*/nuevo`, recibo o multi-asignación.
- Rediseño adicional del drawer más allá del header.

## Data model

Sin cambios. Reutiliza props y estado del `PaymentDrawer` de SPEC 45.

## Implementation plan

1. `voucher-amounts-band.tsx`: label `"Total"`.
2. `payment-drawer.tsx`: reemplazar badge + número + entidad + meta por las tres líneas uniformes (`text-sm`, labels CAPS muted, valores foreground, tipo en MAYÚSCULAS vía `getOptionLabel(...).toUpperCase()`).
3. `payment-drawer.tsx`: prependear `{ value: null, label: "Seleccionar" }` en `methodItems`/`accountItems` y añadir `<SelectItem value={null}>Seleccionar</SelectItem>` en ambos `SelectContent`.
4. Tests de componente + comentario del e2e; validación final `npm run lint` + `npm test` + `npm run build` + verificación visual en navegador.

## Acceptance criteria

- [x] El header muestra `FACTURA: F001-000012` (tipo en MAYÚSCULAS) y las tres líneas usan el mismo tamaño de letra, sin badge. Verificado en navegador: tres líneas a 14px y tipo en mayúsculas por CSS.
- [x] La segunda línea es `CLIENTE: razón social` en ventas y `PROVEEDOR: razón social` en compras. Verificado en navegador (ventas) y en `payment-drawer.test.tsx` (EGRESO).
- [x] La tercera línea muestra `FECHA EMISIÓN` y `CONDICIÓN` siempre; `VENCIMIENTO` con fecha solo a Crédito y ausente con Contado. Verificado en navegador con FF01-00009 (contado, sin vencimiento) y FF01-00007 (crédito, 02/10/2026), más test de componente.
- [x] La banda muestra "Total" en el drawer y en el detalle del comprobante. Cambio en `VoucherAmountsBand`; verificado en navegador y test de componente.
- [x] Tras elegir un método, la lista sigue mostrando "Seleccionar" y al elegirlo el campo se limpia. Verificado en navegador y test de componente.
- [x] Ídem en Caja/Banco; y limpiar el método con una cuenta de banco elegida deja la cuenta vacía. Verificado en navegador y test de componente.
- [x] `npm run lint`, `npm test` y `npm run build` pasan. 490 tests en verde (54 archivos).

## Decisions

- **Sí:** "Total" global en la banda (mismo componente en drawer y detalle). **No:** prop para divergir labels.
- **Sí:** placeholder persistente solo en los selects del drawer. **No:** extender a los demás selects de la app (va en su propia pasada si se pide).
- **Sí:** labels CAPS en color tenue + valores en color normal, todo `text-sm`, sin badge (elección del usuario). **No:** todo plano idéntico.
- **Sí:** ocultar "VENCIMIENTO" cuando la condición es Contado. **No:** mostrar "—".
- **Sí:** reutilizar el patrón `<SelectItem value={null}>` de SPEC 44.

## Risks

| Riesgo | Mitigación |
| --- | --- |
| Ningún e2e aserta el header ni "Total del comprobante" | Solo `payment-drawer.test.tsx` debe actualizarse (verificado en la exploración). |

## What is **not** in this spec

- Placeholder persistente en los demás selects de la app.
- Cambios en la página de pagos, recibo o multi-asignación.
- Otros labels de la banda de montos.

Cada uno de esos, si llega, va en su propia spec.
