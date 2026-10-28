# SPEC 54 — Nombres de proveedor en compras y resumen

> **Status:** Implementado
> **Depends on:** SPEC 08, SPEC 41, SPEC 43
> **Date:** 2026-10-28
> **Objective:** Que el listado de compras, el detalle de un comprobante de compra y los vencidos por pagar del Resumen muestren el nombre real del proveedor en lugar de "Proveedor no encontrado", resolviéndolo contra la lista de proveedores (`listSuppliers`) y conservando los textos de fallback actuales.

## Why this spec exists

El seed semanal (2026-10-28) creó 3 proveedores con `is_client = false` y 12 compras. Al abrir las pantallas con Playwright apareció el defecto:

- `/compras` mostraba **"Proveedor no encontrado"** en todas las filas.
- `/compras/[id]` mostraba **"Proveedor: Proveedor no encontrado"**.

La causa es de resolución de nombres, no de datos: `components/compras/compras-listado-view.tsx`, `components/compras/purchases-data-table.tsx`, `components/comprobantes/voucher-detalle-view.tsx` y `app/(app)/page.tsx` resuelven la entidad contra `useClientes()` (solo `is_client = true`). El formulario de compra, el drawer de pago y las notas ya usan `listSuppliers()`; solo estas pantallas quedaron con clientes.

El seed anterior (SPEC 21) no tenía proveedores, así que el defecto estaba oculto. Con proveedores reales el módulo de compras se ve roto: el usuario no puede identificar a quién le compró ni conciliar la cuenta por pagar.

## Scope

**In:**

1. **Listado de compras** (`components/compras/compras-listado-view.tsx` y `components/compras/purchases-data-table.tsx`):
   - Cargar proveedores con `listSuppliers()` en un `useEffect` local (patrón de `components/notas/notas-listado-view.tsx`).
   - Renombrar la prop `clients` de `PurchasesDataTable` a `suppliers` y resolver el nombre contra esa lista.
   - Mantener el fallback `"Proveedor no encontrado"`.
   - El buscador global de la tabla sigue filtrando por `supplierName`; al cargar los nombres, el filtro por proveedor empieza a funcionar.
2. **Detalle de comprobante** (`components/comprobantes/voucher-detalle-view.tsx`):
   - Conservar `useClientes()` para `voucherKind = "VENTA"`.
   - Cargar `listSuppliers()` cuando `voucherKind = "COMPRA"` y resolver `entityName` contra proveedores.
   - Mantener `"Cliente no encontrado"` / `"Proveedor no encontrado"` según el tipo.
3. **Resumen de cartera** (`app/(app)/page.tsx`):
   - Cargar proveedores una vez con `listSuppliers()`.
   - `OverdueList` recibe una prop `entities` (renombrada desde `clients`); la lista de **por cobrar** usa clientes y la de **por pagar** usa proveedores.
   - Mantener el fallback `"Entidad no encontrada"` de ese componente.
4. **Tests:**
   - Actualizar `tests/components/voucher-detalle-view.test.tsx`: mockear `listSuppliers` y cubrir compra con proveedor + compra con id desconocido.
   - Nuevo test de `PurchasesDataTable`: resuelve el nombre del proveedor y cae al fallback cuando no existe.
   - Nuevo test del Resumen: un comprobante de compra vencido muestra el nombre del proveedor (y uno de venta sigue mostrando el cliente).
5. **Validación:** `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build` y smoke con Playwright sobre `/`, `/compras` y `/compras/[id]` con el seed semanal.

**Out of scope (for future specs):**

- Cambiar `components/ventas/ventas-listado-view.tsx` ni `sales-data-table.tsx`: el formulario de venta solo ofrece clientes, así que resolver contra `clients` es correcto.
- Extender `ClientesProvider` con proveedores o cachear la lista a nivel global (decisión tomada: fetch local por pantalla).
- Estado de carga visible ("…" o skeleton) mientras llegan los proveedores.
- Cambios de esquema, RLS, migraciones o datos: la corrección es solo de lectura/resolución en el cliente.
- Unificar el fallback a "Entidad no encontrada" en compras y detalle.
- Mostrar proveedores en el listado de ventas o en el filtro de clientes.

## Data model

**No introduce estructuras nuevas.** Se reutiliza `listSuppliers()` (`lib/clientes/entidades.ts`, filtra `is_supplier = true`) y el tipo `Client` existente. Sin migraciones ni cambios de RLS.

## Implementation plan

1. **Listado de compras.** En `compras-listado-view.tsx`, quitar `useClientes`, agregar `useState<Client[]>` + `useEffect` con `listSuppliers()` (catch silencioso a `[]`) y pasar `suppliers` a la tabla. En `purchases-data-table.tsx`, renombrar la prop a `suppliers` y `getSupplierName(suppliers, supplierId)`.
2. **Detalle.** En `voucher-detalle-view.tsx`, agregar estado de proveedores y cargarlos solo si `!isSale`; `entityName` resuelve contra `suppliers` en compras y `clients` en ventas. Extraer la resolución a una función local testeable si el test lo requiere.
3. **Resumen.** En `app/(app)/page.tsx`, cargar proveedores con `listSuppliers()` en un `useEffect`; cambiar `OverdueList` para recibir `entities` y pasar `clients` a la tarjeta de cobranza y `suppliers` a la de pagos.
4. **Tests.** Actualizar el test del detalle (mock de `listSuppliers` y casos de compra), crear el test de la tabla de compras y el del Resumen con un vencido por pagar.
5. **Validación.** `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build`; luego Playwright contra el dev server: `/compras` (3 proveedores con nombre), `/compras/b0000001-0000-4000-8000-000000000001` ("Proveedor: AGROINDUSTRIAL TRUJILLO SAC"), `/` sin regresiones, y consola sin errores.

## Acceptance criteria

- [x] `/compras` muestra los nombres de los 3 proveedores del seed (AGROINDUSTRIAL TRUJILLO SAC, IMPORTADORA PACIFICO EIRL, SERVICIOS LOGISTICOS CHIMU SAC) en todas las filas, sin ningún "Proveedor no encontrado".
- [x] `/compras/b0000001-0000-4000-8000-000000000001` muestra "Proveedor: AGROINDUSTRIAL TRUJILLO SAC".
- [x] Un comprobante de compra con `entity_id` inexistente sigue mostrando "Proveedor no encontrado"; una venta sin cliente sigue mostrando "Cliente no encontrado".
- [x] El Resumen muestra el nombre del proveedor en los comprobantes vencidos por pagar (cubierto por test de componente) y conserva el nombre del cliente en los vencidos por cobrar.
- [x] El buscador de `/compras` encuentra filas escribiendo el nombre del proveedor.
- [x] `/ventas` y `/ventas/[id]` no cambian de comportamiento.
- [x] No se agregan migraciones, tablas, columnas ni políticas; `git diff` solo toca componentes de compras, el detalle, el resumen y tests.
- [x] `npx tsc --noEmit`, `npm run lint`, `npm test` y `npm run build` en verde; Playwright en `/`, `/compras` y `/compras/[id]` sin errores de consola.

## Decisions

- **Sí:** cargar `listSuppliers()` localmente en cada componente (elección del usuario). **No:** reutilizar `useEntityOptions("EGRESO")` (acopla compras al hook de pagos) ni extender `ClientesProvider` (cambia la API del provider y su caché).
- **Sí:** mantener los textos específicos "Proveedor no encontrado" / "Cliente no encontrado". **No:** unificar a "Entidad no encontrada" — en compras el mensaje específico dice qué falta.
- **Sí:** aceptar el flash breve del fallback mientras llega `listSuppliers()`. **No:** agregar estado de carga visible ni exponer `isLoading` en una API nueva.
- **Sí:** corregir también el Resumen, porque la lista de vencidos por pagar usa el mismo patrón y mostraría "Entidad no encontrada" con proveedores reales. **No:** tocar ventas, donde resolver contra clientes es correcto por diseño del formulario.
- **Asumido:** el fallback también cubre el caso de error de red al cargar proveedores (catch silencioso); no se agrega toast para no duplicar mensajes con los errores de carga de compras.

### Notas de implementación (2026-10-28)

- `listSuppliers()` se carga en un `useEffect` local en los tres consumidores (listado de compras, detalle y Resumen), con catch silencioso a `[]`, igual que `notas-listado-view`. Sin cambios en `ClientesProvider` ni en `useEntityOptions`.
- `PurchasesDataTable` recibe `suppliers` (antes `clients`) y resuelve `supplierName` contra esa lista; el buscador global ya filtra por ese campo y quedó verificado en UI escribiendo "CHIMU".
- El detalle resuelve `entities = isSale ? clients : suppliers` y conserva los textos "Cliente no encontrado" / "Proveedor no encontrado". En ventas no se llama a `listSuppliers` (cubierto por test).
- `OverdueList` del Resumen recibe `entities`; cobranzas usan `clients` y pagos usan `suppliers`.
- Tests: 634 en 74 archivos. Nuevos `tests/components/purchases-data-table.test.tsx` (nombre, fallback y búsqueda) y `tests/components/home-cartera.test.tsx` (proveedor en vencidos por pagar, cliente en por cobrar, fallback); 3 casos nuevos en `voucher-detalle-view.test.tsx`.
- Verificación con Playwright (0 errores de consola): `/compras` con los 3 proveedores, `/compras/b0000001-…` con "Proveedor: AGROINDUSTRIAL TRUJILLO SAC", `/` sin regresiones y `/ventas/[id]` con "Cliente: BODEGA LA ESPERANZA EIRL". Capturas en `.playwright-mcp/spec54-*.png`.
- Nota: `tests/components/payment-drawer.test.tsx` agotó su timeout de 5 s al correr la suite en paralelo con `npm run build`; aislado y en la suite sola pasa (no relacionado con este cambio).

## Risks

| Risk | Mitigación |
| --- | --- |
| Cada pantalla hace su propia consulta a `entidad` | Es una tabla chica y filtrada por `is_supplier`; se acepta el costo para no tocar el provider (decisión del usuario) |
| Si `listSuppliers()` falla, el nombre cae al fallback sin avisar | El fallback ya comunica el estado; el error de datos principal se sigue mostrando por el provider de compras |
| El test del Resumen requiere mockear `usePagos`, `useClientes` y `listOpenVouchers` | Se mockean con `vi.mock` siguiendo el patrón de `voucher-detalle-view.test.tsx` |
| Cambiar la prop `clients` de `PurchasesDataTable` rompe consumidores | Solo hay un consumidor (`compras-listado-view`); el renombre se hace en el mismo commit y el test lo cubre |
| Un proveedor que también es cliente aparece distinto en ventas y compras | Es el comportamiento correcto: cada módulo resuelve contra su universo (`is_client` / `is_supplier`) |

## What is **not** in this spec

Cambios en ventas, proveedores globales en el provider, caché compartida, estado de carga visible, unificación de textos, y cualquier cambio de esquema, datos o RLS. Cada uno, si llega, va en su propia spec.
