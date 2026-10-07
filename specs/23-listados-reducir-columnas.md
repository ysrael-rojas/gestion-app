# SPEC 23 — Reducir columnas en los listados de ventas y compras

> **Status:** Aprobado
> **Depends on:** SPEC 12
> **Date:** 2026-10-06
> **Objective:** Quitar las columnas Condición, Pagado y Saldo de los listados de `/ventas/listado` y `/compras/listado`, dejando solo F. emisión, T. comprobante, Nro comprobante, Cliente/Proveedor, Total, Estado pago y los botones de acción.

## Why this spec exists

Tras implementar SPEC 12, ambos listados quedaron con 10 columnas. En el uso diario, las columnas Condición, Pagado y Saldo suman ruido: el estado de pago (badge) ya resume la situación del comprobante, y el detalle de Pagado/Saldo está disponible al abrir el comprobante (modal de detalle, SPEC 14). Esta spec simplifica el listado a las columnas de identificación y el importe total, igual en ventas y compras.

## Scope

**In:**

- Eliminar las columnas `paymentType` (Condición), `paidAmount` (Pagado) y `balance` (Saldo) de `components/ventas/sales-columns.tsx`.
- Eliminar las mismas tres columnas de `components/compras/purchases-columns.tsx`.
- Ambos listados quedan con este orden final (idéntico):
  1. `issueDate` — F. emisión
  2. `voucherType` — T. comprobante
  3. `voucherNumber` — Nro comprobante
  4. `clientName` (ventas) / `supplierName` (compras) — Cliente / Proveedor
  5. `total` — Total
  6. `status` — Estado pago
  7. `actions` — Acciones (sr-only)
- Los encabezados restantes conservan sus títulos y alineaciones actuales de SPEC 12 (centrado en fechas/códigos/estado, Cliente/Proveedor a la izquierda, Total a la derecha, acciones a la derecha).
- Los botones de acción se mantienen como están: Ver (Eye), Registrar pago (Wallet, solo PENDIENTE), Imprimir (Printer) y Editar (Pencil).
- El ordenamiento por encabezado solo existe para las columnas visibles restantes; al eliminar una columna desaparece también su opción de orden.

**Out of scope (for future specs):**

- Modificar el modal de detalle de venta o compra (el detalle sigue mostrando Condición, Pagado y Saldo en sus `DetailField`).
- Column visibility toggle (mostrar/ocultar columnas desde la UI).
- Modificar tipos (`Sale`, `Purchase`, `SalesRow`, `PurchasesRow`), providers, loaders de `lib/` o schemas zod: los campos `paymentType`, `paidAmount` y `balance` siguen existiendo en los datos, solo dejan de renderizarse en la tabla.
- Cambios a la lógica de pagos, base de datos o filtros.
- Agregar, quitar o renombrar botones de acción.

## Data model

Esta spec no crea ni modifica estructuras de datos. Solo elimina tres definiciones de columna en dos archivos de UI. Los tipos `SalesRow extends Sale` y `PurchasesRow extends Purchase` quedan intactos (siguen incluyendo `paymentType`, `paidAmount` y `balance` aunque la tabla no los muestre).

## Implementation plan

1. `components/ventas/sales-columns.tsx`: eliminar los tres bloques de `columnHelper.accessor(...)` correspondientes a `paymentType`, `paidAmount` y `balance`. Quedan 7 columnas en el orden del Scope. Verificar que no queden imports sin uso (no debería: `formatCurrency` sigue usándose en Total, `getOptionLabel`/`PAYMENT_TYPES`/`SALE_STATUSES`/`VOUCHER_TYPES` siguen usándose en las columnas restantes). `npm run lint`.
2. `components/compras/purchases-columns.tsx`: mismos cambios que el paso 1. `npm run lint`.
3. Verificación con `npm run dev`:
   - `/ventas/listado`: la tabla muestra exactamente las 7 columnas del orden final, sin Condición, Pagado ni Saldo; el ordenamiento por encabezado funciona en las columnas visibles; los 4 botones de acción siguen presentes (Registrar pago solo en filas PENDIENTE).
   - `/compras/listado`: ídem, con encabezado `Proveedor` en la columna 4.
   - Abrir el modal de detalle de una venta y una compra: confirmar que ahí sí siguen apareciendo Condición, Pagado y Saldo (fuera de alcance).
4. Cerrar con `npm run lint`, `npm test` y `npm run build` en verde.

## Acceptance criteria

- [ ] En `/ventas/listado` y `/compras/listado` no existe ninguna columna con encabezado Condición, Pagado ni Saldo.
- [ ] En ambos listados el orden de columnas es: F. emisión, T. comprobante, Nro comprobante, Cliente/Proveedor, Total, Estado pago, Acciones.
- [ ] Los títulos y alineaciones de las columnas restantes son los de SPEC 12 (sin cambios visuales).
- [ ] Los botones de acción siguen siendo Ver, Registrar pago (solo PENDIENTE), Imprimir y Editar.
- [ ] El botón `Registrar pago` sigue enlazando a `/pagos/ingresos` (ventas) y `/pagos/egresos` (compras) con los query params actuales.
- [ ] Cada encabezado restante sigue siendo clickeable para ordenar.
- [ ] El modal de detalle de venta y de compra sigue mostrando Condición, Pagado y Saldo.
- [ ] `npm run lint`, `npm test` y `npm run build` pasan.

## Decisions

- **Sí:** aplicar el mismo set de columnas a ventas y compras (el usuario lo pidió explícitamente: "como el de compras").
- **Sí:** eliminación definitiva de las columnas del listado, sin toggle de visibilidad ni configuración por usuario. El detalle sigue siendo el lugar de esos datos.
- **Sí:** al quitar una columna se quita su ordenamiento; no se conservan accesos de orden por columnas ocultas.
- **Sí:** mantener los 4 botones de acción, incluido Imprimir aunque hoy no tenga acción real (así lo decidió el usuario).
- **No:** tocar `Sale`, `Purchase`, loaders (`lib/comprobantes/`), schemas ni base de datos: los campos siguen en los datos, solo salen de la tabla.
- **No:** cambiar el modal de detalle; ahí los datos Condición/Pagado/Saldo siguen visibles.

## Risks

| Riesgo | Mitigación |
| --- | --- |
| Quedar imports sin uso en los files de columns (p. ej. `getOptionLabel`) rompe el lint | Los imports usados por las columnas restantes cubren `VOUCHER_TYPES`, `SALE_STATUSES`, `formatCurrency`, `formatDate`; `npm run lint` lo confirma. |
| Algún test de componente asuma las columnas eliminadas | Los tests actuales (`tests/unit/`) solo cubren `lib/`; `npm test` lo confirma. |
| El estado de sorting guardado en memoria del provider refiera a una columna eliminada (`paidAmount`, `balance`, `paymentType`) | TanStack resuelve columnas inexistentes sin romper (ignora el id); si apareciera un error, limpiar el estado inicial de sorting del provider. |
