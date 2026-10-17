# SPEC 40 — Picker de comprobante referenciable para notas y retenciones

> **Status:** Implementado
> **Depends on:** SPEC 39
> **Date:** 2026-10-17
> **Objective:** Registrar una nota o retención en dos pasos: elegir el comprobante referenciable en un modal de lista (pestañas, búsqueda y tope disponible) y completar el registro con su ficha como cabecera.

## Why this spec exists

SPEC 39 dejó la referencia a un select dentro del formulario. En uso real el select mezcla todas las ventas y compras, no muestra el tope disponible y cada comprobante es una línea sin contexto. El usuario pidió el 2026-10-17 un flujo de dos pasos: primero elegir el comprobante en un listado con sus datos a la vista, luego registrar el documento. Ese picker además vuelve innecesarios dos selects del formulario actual: "Relación" y "Comprobante referenciado".

## Scope

**In:**

1. Componente nuevo `components/notas/referable-picker-modal.tsx`: modal con data table de comprobantes referenciables. Primera columna de acción con botón "Elegir"; luego F. emisión, Nro, Cliente/Proveedor, Total y Tope disponible. Búsqueda global y paginación (`DataTablePagination`), con el patrón de `notas-data-table.tsx`.
2. Pestañas "Emitidas" / "Recibidas" (`components/ui/tabs.tsx`) que separan ventas (`VENTA`) y compras (`COMPRA`). En retención no hay pestañas: la lista es solo de compras. Por defecto abre en Emitidas (NC/ND).
3. Elegibilidad en el picker:
   - NC y retención: tope disponible = `max(0, total − créditos y retenciones ya aplicados)`; la fila con tope 0 queda deshabilitada (botón "Elegir" deshabilitado y fila atenuada).
   - ND: no tiene tope; la columna muestra "—" y todas las filas son elegibles.
4. Flujo de creación en `NotasListadoView`: "Registrar ..." abre el picker; al elegir un comprobante, el picker se cierra y se abre `NotaModal` con la ficha del elegido. El flujo de edición no pasa por el picker (la referencia no cambia): abre directo el modal con la ficha.
5. `NotaModal` y `NotaForm` reciben el referenciable elegido. El formulario quita los selects de "Relación" y "Comprobante referenciado" y muestra la ficha como cabecera: entidad, tipo + número, fecha de emisión, total, saldo y tope (en ND: "una nota de débito aumenta el saldo"). Al editar con el referenciado ausente de la lista, la ficha se arma con los datos guardados en la nota (entidad, tipo, número), sin saldo ni tope.
6. Sin cambios de datos: `referencedComprobanteId` sigue viajando como campo oculto del formulario; `notaSchema`, `lib/comprobantes/notas.ts` y la vista `voucher_balance` no cambian. El picker consume los referenciables que `NotasListadoView` ya carga con `listReferableComprobantes`.

**Out of scope (for future specs):**

- Migraciones, triggers o cambios a la vista `voucher_balance` (SPEC 39 queda intacta).
- Picker en el flujo de edición.
- Selección con clic sobre toda la fila, multiselección o atajos de teclado.
- Deep links (`/notas/credito?referido=...`) y prellenado desde ventas/compras.
- Cambios a los listados de ventas/compras o al flujo de pagos.

## Data model

No introduce estructuras de datos nuevas: reutiliza `ReferableComprobante` de `components/notas/types.ts` (ya trae `issueDate`, `total`, `balance`, `creditAmount`). Solo hay estado de UI en `NotasListadoView`, no persistido:

```ts
// Estado del flujo en NotasListadoView
pickerOpen: boolean;
selectedReferable: ReferableComprobante | null;

// Props nuevas
// NotaModal / NotaForm: referable: ReferableComprobante | null
// null solo al editar cuando el referenciado ya no está en la lista;
// en ese caso la ficha usa los campos guardados en Nota
// (entityId, referencedNumber, referencedType).
```

Convenciones:

- Tope disponible para mostrar = `max(0, total − creditAmount)`; al editar se excluye la propia nota (lógica que ya existe en `nota-form.tsx`).
- El `voucherKind` del referenciable (`VENTA` = Emitidas, `COMPRA` = Recibidas) determina la pestaña y es el valor que hereda el documento al guardar.

## Implementation plan

1. `components/notas/referable-picker-modal.tsx`: modal con pestañas (Base UI Tabs), búsqueda, paginación y reglas de elegibilidad. Test de componente nuevo `tests/components/referable-picker-modal.test.tsx`: pestañas Emitidas/Recibidas, retención sin pestañas, fila con tope 0 deshabilitada, ND siempre elegible y `onSelect` al presionar "Elegir".
2. `components/notas/nota-form.tsx`: recibe `referable`; quita los selects de "Relación" y "Comprobante referenciado"; ficha del referenciado como cabecera (con fallback a los datos de la nota) y `referencedComprobanteId` como campo oculto. Actualiza `tests/components/nota-form.test.tsx` (hoy asume selects).
3. `components/notas/nota-modal.tsx` y `components/notas/notas-listado-view.tsx`: flujo picker → modal en creación, edición directa y estado `pickerOpen` / `selectedReferable`.
4. `tests/e2e/registrar-nota-credito-y-ver-saldo.spec.ts` adaptado al flujo de dos pasos y validación final `npm run lint` + `npm test` + `npm run build`.

## Acceptance criteria

- [x] "Registrar nota de crédito" y "Registrar nota de débito" abren primero el picker con las pestañas Emitidas/Recibidas; "Registrar retención" abre la lista solo de compras y sin pestañas.
- [x] El picker lista F. emisión, Nro, Cliente/Proveedor, Total y Tope disponible, con búsqueda y paginación.
- [x] En NC y retención la fila con tope 0 está deshabilitada (no se puede elegir); en ND todas las filas son elegibles y el tope muestra "—".
- [x] Al presionar "Elegir", el picker se cierra y se abre el modal de registro con la ficha del comprobante (entidad, tipo + número, fecha, total, saldo, tope) como cabecera.
- [x] El formulario ya no muestra los selects de "Relación" ni "Comprobante referenciado", en creación ni en edición.
- [x] Al editar una nota se abre directo el modal de edición (sin picker) con la ficha del referenciado; si no está en la lista, la ficha usa los datos guardados de la nota.
- [x] Las validaciones de SPEC 39 (motivo obligatorio, número serie-correlativo, tope de créditos, referencia heredada) siguen intactas.
- [x] `npm run lint`, `npm test` y `npm run build` pasan.
- [x] El e2e `registrar-nota-credito-y-ver-saldo` pasa contra el dev server con el seed documentado (flujo de dos pasos).

## Decisions

- **Sí:** picker como primer paso en las tres páginas. **No:** mantener el select de comprobante referenciado — no muestra tope ni contexto y crece sin control.
- **Sí:** pestañas Emitidas/Recibidas dentro del picker (reemplazan el select "Relación"); retención sin pestañas porque solo referencia compras. **No:** listado único mezclado.
- **Sí:** botón "Elegir" en la primera columna. **No:** fila entera cliqueable — descubrimiento y accesibilidad.
- **Sí:** fila deshabilitada cuando el tope es 0 en NC/retención. **No:** permitir elegir y fallar recién al guardar.
- **Sí:** ficha completa en el segundo modal. **No:** mantener el resumen mínimo actual junto a los selects.
- **Sí:** edición sin picker. **No:** permitir re-referenciar — la referencia es inmutable (trigger de BD y regla de SPEC 39).
- **Sí:** reutilizar `ReferableComprobante` ya cargado en el listado. **No:** nueva consulta o cambios en `lib/comprobantes/notas.ts`.

## Risks

| Risk | Mitigation |
| --- | --- |
| Pestañas de Base UI dentro de un Dialog (portal y foco) | Cubierto por el test de componente; fallback: lista única con badge Emitida/Recibida. |
| Lista de referenciables grande (todas las ventas acumuladas) | Búsqueda global + paginación de 10, igual que los listados existentes. |
| Referenciado ausente de `voucher_balance` al editar (p. ej. baja lógica) | Ficha con los datos guardados en la nota (entidad, tipo, número), sin saldo ni tope; la BD sigue validando al guardar. |
| El e2e pasa a dos pasos y depende del seed y del dev server | Seed documentado en el comentario del spec (como SPEC 39); la NC de prueba consume tope en cada corrida. |

## What is **not** in this spec

- Cambios de esquema, migraciones o a la vista `voucher_balance`.
- Reimplementar las reglas de SPEC 39 (tope, motivo, número, inmutabilidad).
- Picker en edición, selección por fila y multiselección.
- Deep links y prellenado desde otros módulos.

Cada uno de esos, si llega, va en su propia spec.
