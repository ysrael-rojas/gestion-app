# SPEC 12 — Labels en filtros y reestructuración de columnas en listados de ventas y compras

> **Status:** Implementado
> **Depends on:** SPEC 07, SPEC 08, SPEC 11
> **Date:** 2026-09-30
> **Objective:** Añadir etiquetas visibles a los filtros de fecha y estado del `ListingsToolbar` y reestructurar (encabezados, orden y alineación) las columnas de los listados de ventas y compras, renombrando "Tipo pago" a "Condición".

## Why this spec exists

SPEC 11 dejó `ListingsToolbar` con dos inputs `type="date"` y un `Select` de estado sin etiquetas visibles: solo tienen `aria-label`. Un usuario que abre `/ventas/listado` o `/compras/listado` no sabe qué representa cada control sin mirarlo con cuidado. Además, las columnas de ambas tablas crecieron sin criterio de alineación: los importes quedan a la izquierda, las fechas y los códigos no están centrados, y el término "Tipo pago" no refleja que el dato es la condición comercial del comprobante (CONTADO / CREDITO). Esta spec pule la presentación del listado para que sea legible y consistente entre ventas y compras.

## Scope

**In:**

- Etiquetas visibles en `components/shared/listings-toolbar.tsx`:
  - `Desde:` antes del input de fecha de inicio.
  - `Hasta:` antes del input de fecha final.
  - `Estado pago:` antes del `Select` de estado.
- El input de búsqueda libre ("Buscar ventas..." / "Buscar compras...") **mantiene solo su placeholder**, sin etiqueta visible.
- Reestructuración de encabezados, orden y alineación de columnas en `components/ventas/sales-columns.tsx` y `components/compras/purchases-columns.tsx`.
- Renombrar la columna "Tipo pago" a "Condición" en ambas tablas.
- En el **listado**, la columna "Condición" muestra el valor crudo del enum (`CONTADO` / `CREDITO`), no el label amigable.
- Alineación por columna:
  - Centrado: `F. emisión`, `T. comprobante`, `Nro comprobante`, `Condición`, `Días de crédito`, `F. vencimiento`, `Estado pago`.
  - Izquierda: `Cliente` (ventas) / `Proveedor` (compras).
  - Derecha: `Total`.
  - La columna de acciones conserva su alineación a la derecha actual.
- Renombrar la etiqueta "Tipo de pago" a "Condición" también en:
  - `components/ventas/sale-form.tsx` y `components/compras/purchase-form.tsx` (el `Select`).
  - `components/ventas/sale-detail-modal.tsx` y `components/compras/purchase-detail-modal.tsx` (el `DetailField`).
  - En formularios y detalle, las opciones/valores **siguen usando los labels amigables** (`Contado` / `Crédito`).

**Out of scope (for future specs):**

- Filtros nuevos (cliente/proveedor, tipo de comprobante, fecha de vencimiento, rango de totales).
- Paginación o filtrado server-side.
- Cambiar los valores del enum `payment_type` (`CONTADO` / `CREDITO`) ni `PaymentType`.
- Cambiar los labels del catálogo `PAYMENT_TYPES` en `lib/data/sale-options.ts`.
- Reordenar o renombrar otras columnas más allá de lo listado.
- Exportar el listado (CSV/PDF) o reimprimir.
- Cambios a la lógica de pagos (SPEC 09), providers, schemas zod o base de datos.

## Data model

Esta spec no crea tablas, migraciones ni tipos de dominio nuevos. Reutiliza `Sale` (SPEC 07), `Purchase` (SPEC 08), `PaymentType` y `ListadoFilters` (SPEC 11).

Convención de presentación (solo UI, sin nuevos tipos):

| Columna | Encabezado | Alineación de encabezado y celdas | Valor mostrado |
| --- | --- | --- | --- |
| `issueDate` | F. emisión | centrado | `formatDate(...)` |
| `voucherType` | T. comprobante | centrado | `getOptionLabel(VOUCHER_TYPES, ...)` |
| `voucherNumber` | Nro comprobante | centrado | valor crudo |
| `clientName` / `supplierName` | Cliente / Proveedor | izquierda | nombre resuelto |
| `total` | Total | derecha | `formatCurrency(...)` |
| `paymentType` | Condición | centrado | `sale.paymentType` / `purchase.paymentType` (crudo) |
| `creditDays` | Días de crédito | centrado | número o `—` |
| `dueDate` | F. vencimiento | centrado | `formatDate(...)` o `—` |
| `status` | Estado pago | centrado | `<PaymentStatusBadge ... />` |

Orden final de columnas (idéntico en ambas tablas):

1. `issueDate`
2. `voucherType`
3. `voucherNumber`
4. `clientName` (ventas) / `supplierName` (compras)
5. `total`
6. `paymentType`
7. `creditDays`
8. `dueDate`
9. `status`
10. `actions`

En ventas el orden actual ya coincide. En compras hay que reubicar `status`, que hoy está entre `paymentType` y `creditDays`, para que quede al final (posición 9) antes de `actions`.

## Implementation plan

1. `components/shared/listings-toolbar.tsx`: importar `Label` desde `@/components/ui/label`. Envolver cada par `Label + control` en un contenedor `flex items-center gap-2` y anteponer: `Desde:` al input `desde`, `Hasta:` al input `hasta`, y `Estado pago:` al `Select`. Conservar los `aria-label` actuales. `npm run lint`.
2. `components/ventas/sales-columns.tsx`:
   - Renombrar encabezados: `Fecha emisión` → `F. emisión`, `Tipo comprobante` → `T. comprobante`, `Nro comprobante` (sin cambio), `Cliente` (sin cambio), `Total` (sin cambio), `Tipo pago` → `Condición`, `Días de crédito` (sin cambio), `Fecha de vencimiento` → `F. vencimiento`, `Estado Pago` → `Estado pago`.
   - Cambiar la celda de `paymentType` para imprimir `sale.paymentType` directo (CONTADO / CREDITO) en lugar de `getOptionLabel(PAYMENT_TYPES, ...)`.
   - Aplicar alineación: envolver cada header (el `<Button variant="ghost">` de ordenamiento) en un `<div className="flex w-full justify-center|justify-end">` según corresponda; envolver cada celda en `<div className="text-center|text-left|text-right">`. El `PaymentStatusBadge` va dentro de `<div className="flex justify-center">`.
   - Eliminar el import de `PAYMENT_TYPES` si queda sin uso. `npm run lint`.
3. `components/compras/purchases-columns.tsx`: mismos cambios que el paso 2, **manteniendo el encabezado `Proveedor`** en la columna 4, y **moviendo el bloque de `status`** para que quede en la posición 9 (después de `dueDate`) antes de `actions`. Eliminar el import de `PAYMENT_TYPES` si queda sin uso. `npm run lint`.
4. `components/ventas/sale-form.tsx` y `components/compras/purchase-form.tsx`: cambiar el `Label` del `Select` de pago de "Tipo de pago" a "Condición". No tocar las opciones (siguen `Contado` / `Crédito`). `npm run lint`.
5. `components/ventas/sale-detail-modal.tsx` y `components/compras/purchase-detail-modal.tsx`: cambiar el `label` del `DetailField` de pago de "Tipo de pago" a "Condición". El `value` sigue `getOptionLabel(PAYMENT_TYPES, ...)`. `npm run lint`.
6. Verificación manual con `npm run dev`:
   - `/ventas/listado` y `/compras/listado`: confirmar los labels `Desde:`, `Hasta:` y `Estado pago:`; confirmar alineaciones (fechas/códigos/estado centrados, cliente/proveedor a la izquierda, total a la derecha) y el orden de columnas.
   - Confirmar que "Condición" muestra `CONTADO` / `CREDITO` en el listado.
   - Abrir un formulario y un detalle: confirmar el label "Condición" y que las opciones/valores siguen "Contado" / "Crédito".
7. Cerrar con `npm run lint` y `npm run build` en verde.

## Acceptance criteria

- [x] En `/ventas/listado` y `/compras/listado` el filtro de fecha de inicio muestra la etiqueta `Desde:`.
- [x] El filtro de fecha final muestra la etiqueta `Hasta:`.
- [x] El filtro de estado muestra la etiqueta `Estado pago:`.
- [x] El input de búsqueda libre conserva solo su placeholder, sin etiqueta visible.
- [x] La primera columna se titula `F. emisión` y su contenido (encabezado y celdas) está centrado.
- [x] La segunda columna se titula `T. comprobante` y su contenido está centrado.
- [x] La columna `Nro comprobante` tiene su contenido centrado.
- [x] La columna `Cliente` (ventas) y `Proveedor` (compras) tiene su contenido alineado a la izquierda.
- [x] La columna `Total` tiene su contenido alineado a la derecha.
- [x] La columna se titula `Condición` y muestra los valores `CONTADO` / `CREDITO` en el listado.
- [x] La columna `Días de crédito` tiene su contenido centrado.
- [x] La columna se titula `F. vencimiento` y su contenido está centrado.
- [x] La columna se titula `Estado pago` y su contenido (badge) está centrado.
- [x] En ambas tablas el orden de columnas es: F. emisión, T. comprobante, Nro comprobante, Cliente/Proveedor, Total, Condición, Días de crédito, F. vencimiento, Estado pago, Acciones.
- [x] El botón de ordenamiento de cada encabezado sigue siendo clickeable luego de aplicar la alineación.
- [x] En el formulario de venta y de compra, la etiqueta del `Select` de pago dice `Condición` y las opciones siguen siendo `Contado` / `Crédito`.
- [x] En el modal de detalle de venta y de compra, la etiqueta del campo de pago dice `Condición` y el valor sigue siendo `Contado` / `Crédito`.
- [x] `npm run lint` y `npm run build` pasan.

## Decisions

- **Sí:** etiquetas con acentos correctos (`F. emisión`, `F. vencimiento`, `Días de crédito`), consistente con el resto de la UI del repo. El pedido original las escribió sin acentos por rapidez, pero se normalizan.
- **Sí:** label visible `Estado pago:` en el filtro (mismo texto que el encabezado de columna), además del `aria-label` existente.
- **Sí:** el buscador de texto libre queda solo con placeholder; no se le agrega label para no competir con los filtros etiquetados.
- **Sí:** "Tipo pago" → "Condición" en listado, formulario y detalle; el término describe mejor el dato (condición comercial CONTADO/CREDITO).
- **Sí:** en el listado `Condición` muestra el valor crudo `CONTADO` / `CREDITO`; en formularios y detalle se mantienen los labels amigables `Contado` / `Crédito` (el listado prioriza el dato, el formulario la lectura).
- **Sí:** columna de tercero en compras sigue llamándose `Proveedor` (conceptual), no `Cliente`.
- **Sí:** alineación aplicada con wrappers `div` con clases Tailwind por columna; no se introduce `meta` de TanStack para evitar tocar los data-tables.
- **Sí:** reordenar `status` en compras para igualar el orden de ventas (al final, antes de acciones).
- **No:** tocar `lib/data/sale-options.ts` ni los valores del enum `PaymentType`.
- **No:** cambiar schemas zod, providers, base de datos ni la lógica de pagos.
- **No:** agregar labels a otras columnas o filtros no mencionados.

## Risks

| Riesgo | Mitigación |
| --- | --- |
| Envolver el `Button` de ordenamiento en un `div` con `justify-*` puede desalinear el header respecto a la celda | Aplicar el mismo criterio (wrapper en header, `text-*` en celda) y verificar visualmente en ambas tablas en modo claro y oscuro. |
| La celda del badge puede quedar descentrada porque `Badge` no ocupa el ancho completo | Centrar con `<div className="flex justify-center">` alrededor del `PaymentStatusBadge`. |
| Quitar `getOptionLabel(PAYMENT_TYPES, ...)` en las columnas deja un import sin uso y rompe el lint | Eliminar el import de `PAYMENT_TYPES` en `sales-columns.tsx` y `purchases-columns.tsx`; `npm run lint` lo confirma. |
| Reordenar bloques de columnas en compras puede alterar el `id` de las columnas y romper el estado de sorting | Mantener los mismos `id` (`paymentType`, `creditDays`, `dueDate`, `status`); solo cambia el orden en el arreglo. |

## What is **not** in this spec

- Filtros nuevos (cliente/proveedor, tipo de comprobante, fecha de vencimiento, rango de totales).
- Paginación o filtrado server-side.
- Cambios a `lib/data/sale-options.ts`, al enum `payment_type` o a los schemas zod.
- Cambios a la lógica de pagos de SPEC 09, providers o base de datos.
- Etiqueta visible en el buscador de texto libre.
- Renombrar `Proveedor` a `Cliente` en compras.
- Exportación (CSV/PDF) o reimpresión.

Cada uno de esos, si aparece, va en su propia spec.
