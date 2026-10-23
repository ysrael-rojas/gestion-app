# SPEC 41 — Páginas de registro, edición y detalle para comprobantes de ventas y compras

> **Status:** Implementado
> **Depends on:** SPEC 07, SPEC 08, SPEC 11, SPEC 24, SPEC 25, SPEC 36
> **Date:** 2026-10-22
> **Objective:** Migrar el registro, edición y visualización de comprobantes de ventas y compras de modales a páginas con rutas propias (`/ventas`, `/ventas/nuevo`, `/ventas/[id]`, `/ventas/[id]/editar` y su espejo en compras), unificando los clones de venta y compra en un único árbol de componentes compartidos parametrizado por tipo de comprobante.

## Why this spec exists

El usuario pidió el 2026-10-22 reestructurar los módulos de ventas y compras: registrar, editar y visualizar un comprobante debe llevar a una página nueva, no a un modal. Los modales actuales (`sm:max-w-2xl`, scroll interno al 90 % de pantalla) son incómodos para carga de datos y no tienen URL propia (no se puede compartir, marcar ni volver con el botón del navegador). Además, ventas y compras son clones casi idénticos (formularios de 424/428 líneas con diferencias menores); el usuario decidió aprovechar la reestructuración para unificar ambos árboles en componentes compartidos.

## Scope

**In:**

1. **Rutas aplanadas** (sin redirect de las URLs viejas, decisión del usuario):
   - `/ventas` — listado (hoy `/ventas/listado`); server component con `parseListadoFilters` de `searchParams`, igual que hoy.
   - `/ventas/nuevo` — página de registro (server shell → vista client).
   - `/ventas/[id]` — página de detalle (visualizar).
   - `/ventas/[id]/editar` — página de edición.
   - Espejo exacto en `/compras`, `/compras/nuevo`, `/compras/[id]`, `/compras/[id]/editar`.
   - Se eliminan las carpetas `app/(app)/ventas/listado/` y `app/(app)/compras/listado/`. Next 16: `params` es `Promise` (`await params`); usar los tipos globales `PageProps<...>` — el build valida los hrefs por las rutas tipadas.
2. **Navbar** (`components/app-navbar.tsx`): hrefs Ventas → `/ventas` y Compras → `/compras`; el estado activo pasa de igualdad exacta de `pathname` a comparación por prefijo de segmento (`/ventas/nuevo` también marca "Ventas" activa).
3. **Data layer nuevo** — `lib/comprobantes/vouchers.ts` con `getVoucherById(id, kind: "VENTA" | "COMPRA")`: fila de `comprobante` + `paid_amount`/`balance` de `voucher_balance` por `comprobante_id`, filtro `deleted_at null` y tipos base, `PGRST116` → `null`. Es el primer fetch individual por id del módulo (precedente interno: `fetchReferencedComprobante` de `notas.ts`, privado y sin saldo). Con tests unitarios con el mock centralizado de Supabase.
4. **Un único árbol compartido en `components/comprobantes/`** (unificación total, decisión del usuario):
   - `voucher-form.tsx` — formulario unificado que reemplaza `sale-form.tsx` y `purchase-form.tsx`. Parametrizado por `voucherKind`: labels Cliente/Proveedor, entidad desde `useClientes()` (VENTA) o `listSuppliers()` (COMPRA, carga ad-hoc como hoy), guard "FACTURA requiere RUC" solo en VENTA, `isPaidLocked` (`paidAmount > 0`), cálculos `calculateAmounts`/`calculateDueDate` intactos. Un solo schema `voucherFormSchema` en `lib/schemas/voucher.ts` (SPEC 39) con campo `entityId`; la vista mapea a los payloads existentes.
   - `voucher-form-view.tsx` — vista client de registro/edición: cabecera (Volver + "Registrar venta/compra" o "Editar …") y el formulario en una pantalla con las tres secciones actuales (Datos del comprobante, Montos, Condición de pago). Guardar usa `addSale`/`updateSale` o `addPurchase`/`updatePurchase` del provider y redirige al detalle (`router.push`), con toast.
   - `voucher-detalle-view.tsx` — vista client de detalle: cabecera (Volver, título tipo + número del comprobante, entidad, badge de estado, botón "Registrar pago" solo si PENDIENTE), `VoucherAmountsBand`, `Tabs` "Datos del comprobante" / "Historial de pagos" (SPEC 24 intacto), `PaymentHistorySection` + `ReceiptDialog`, y `NestedPaymentDrawers` montado en la página (SPEC 25 sin cambios internos); al registrar un pago re-carga el voucher.
   - Tipo compartido `Voucher` en `components/comprobantes/types.ts`.
   - Las páginas de detalle/edición son server shells que pasan el `id`; la vista client carga el voucher con `getVoucherById` (patrón dominante del módulo: datos por client provider/lib, no fetch server-side).
5. **Listados** (`ventas-listado-view.tsx`, `compras-listado-view.tsx`, `sales-columns.tsx`, `purchases-columns.tsx`):
   - "Registrar venta/compra" del header pasa de abrir modal a navegar a `/ventas/nuevo` / `/compras/nuevo`.
   - `Eye` (Ver) navega a `/ventas/[id]`; `Pencil` (Editar) navega a `/ventas/[id]/editar` (ídem compras).
   - Se elimina el botón `Printer` (Imprimir) de ambas columnas: estaba muerto (sin handler).
   - El botón `Wallet` del listado sigue abriendo `NestedPaymentDrawers` en el propio listado (SPEC 25 intacto).
   - Se eliminan los modales y su estado (`modalOpen`, `editingSale`, `viewingSale`, `handleSave`, etc.).
6. **Archivos eliminados:** `sale-modal.tsx`, `purchase-modal.tsx`, `sale-detail-modal.tsx`, `purchase-detail-modal.tsx`, `sale-form.tsx`, `purchase-form.tsx`.
7. **Tests:** test de componente nuevo `voucher-form.test.tsx` fusionando los casos de `sale-form.test.tsx` y `purchase-form.test.tsx` (ambos kinds); tests unitarios de `getVoucherById`; test del navbar actualizado; e2e adaptados: `registrar-pago-y-ver-saldo.spec.ts` (URL `/ventas`, "Ver" ahora navega a la página de detalle) y `registrar-nota-credito-y-ver-saldo.spec.ts` (URL `/ventas`).

**Out of scope (for future specs):**

- Notas y retenciones (SPEC 39/40 intactos: su listado + picker + modal no se tocan).
- Unificar `lib/comprobantes/comprobantes.ts` / `compras.ts` (listados y CRUD existentes) ni los providers `ventas-provider` / `compras-provider`.
- Renombrar el catálogo `sale-options.ts` (hoy misnomer en compras).
- Redirect permanente desde `/ventas/listado` y `/compras/listado`.
- Implementar la impresión de comprobantes (solo se elimina el botón muerto).
- Deep links con prefill en `/ventas/nuevo?clienteId=...`.
- Baja/anulación de comprobantes y cambios de esquema en la BD.
- Cambios internos al wizard `NestedPaymentDrawers` y a `PaymentHistorySection` (solo cambia su punto de montaje).

## Data model

Sin cambios en la base de datos, migraciones ni RLS. Nueva función y tipos:

```ts
// lib/comprobantes/vouchers.ts
interface Voucher {
  id: string;
  issueDate: string;          // + registrationDate, voucherType, voucherNumber,
  entityId: string;           //   total, paymentType, creditDays, dueDate, status
  paidAmount: number;         // desde voucher_balance (0 si no hay fila)
  balance: number;            // total − pagos − créditos + débitos
}
export async function getVoucherById(
  id: string,
  kind: "VENTA" | "COMPRA"
): Promise<Voucher | null>;   // null: no existe, anulado (deleted_at) o de otro tipo

// components/comprobantes/types.ts — tipo Voucher compartido por las vistas

// lib/schemas/voucher.ts — voucherFormSchema (campo único entityId) + VoucherFormValues
```

Convenciones:

- El nombre de la entidad (cliente/proveedor) lo resuelve la vista igual que hoy (entidades del provider), no el getter.
- La vista de edición usa `paidAmount` del getter para `isPaidLocked` (hoy venía de la fila del listado en memoria; el fetch por id a demanda lo mejora).
- Estado de UI no persistido en las vistas: `voucher | null` (detalle/edición), `wizardOpen: boolean` (pago en detalle), `loading`, `notFound`.

## Implementation plan

1. **Getter + tests.** `lib/comprobantes/vouchers.ts` con `getVoucherById` y `tests/unit/lib/comprobantes/vouchers.test.ts` (mock centralizado). Nada lo consume aún; el sistema queda intacto. `npm run lint`.
2. **Rutas aplanadas de listado + navbar.** Mover `app/(app)/ventas/listado/page.tsx` → `app/(app)/ventas/page.tsx` (ídem compras); hrefs y activo por prefijo en `app-navbar.tsx`; actualizar `tests/components/navbar.test.tsx` y las URLs de los e2e que apuntan a `/ventas/listado`. Verificación manual: filtros por URL siguen funcionando. `npm run lint` + `npm test`.
3. **Páginas de detalle.** `voucher-detalle-view.tsx` (cabecera + banda + tabs + historial + wizard de pago con `onRegistered` → re-fetch) y páginas server `/ventas/[id]`, `/compras/[id]` (shells que pasan el id). Verificación manual: URL directa de un comprobante existente y de uno inexistente (estado "no encontrado" con Volver). `npm run lint`.
4. **Formulario unificado + páginas de registro/edición.** `voucher-form.tsx` + `voucher-form-view.tsx` + `voucherFormSchema`; páginas `/ventas/nuevo`, `/ventas/[id]/editar` y espejo compras; `voucher-form.test.tsx` fusionado (RUC solo VENTA, lock con pagos, totales derivados, carga de proveedores en COMPRA) y baja de `sale-form.test.tsx` / `purchase-form.test.tsx`. Guardar → detalle con toast. `npm run lint` + `npm test`.
5. **Rewire de listados y limpieza.** En listados: botones navegan (Ver/Editar), header navega (Registrar), se elimina `Printer`; se quitan estados/handlers de modales. Eliminar los 6 archivos de modales y formularios viejos. `npm run lint` + `npm test` + `npm run build`.
6. **E2E y validación final.** Adaptar `registrar-pago-y-ver-saldo.spec.ts` (flujo completo: listado → registrar pago → Ver navega al detalle → tab Historial) y `registrar-nota-credito-y-ver-saldo.spec.ts`; cierre con `npm run lint` + `npm test` + `npm run build` en verde.

## Acceptance criteria

- [x] `/ventas` y `/compras` muestran el listado con filtros por URL igual que antes; el navbar marca "Ventas" activa en `/ventas`, `/ventas/nuevo`, `/ventas/[id]` y `/ventas/[id]/editar` (ídem "Compras").
- [x] "Registrar venta" del listado navega a `/ventas/nuevo`; la página muestra Volver + título "Registrar venta" y las tres secciones (Datos del comprobante, Montos, Condición de pago); guardar redirige al detalle del comprobante creado con toast "Venta registrada". Verificado en vivo con la venta `FT01-90001` (S/ 180).
- [x] El botón Editar de una fila navega a `/ventas/[id]/editar` con el formulario precargado; guardar redirige al detalle con toast "Venta actualizada". Verificado en vivo: precarga completa y cambio de total de S/ 150 a S/ 180.
- [x] El botón Ver de una fila navega a `/ventas/[id]`: cabecera con Volver, título con tipo + número, entidad y badge de estado; banda con Total/Abonado/Saldo; pestañas "Datos del comprobante" e "Historial de pagos" con el recibo imprimible.
- [x] En el detalle de un comprobante PENDIENTE existe "Registrar pago" que abre el wizard de 4 drawers (SPEC 25) y al registrar actualiza banda, badge e historial sin recargar la página. Verificado con pago total (`RI-000016`, S/ 180) y parcial (`RI-000017`, S/ 1.00): la misma URL actualiza banda, badge e historial.
- [x] Un `id` inexistente o anulado en la URL muestra un estado "no encontrado" con botón Volver, sin crash.
- [x] Reglas intactas: FACTURA exige RUC en ventas (no en compras); campos bloqueados cuando `paidAmount > 0`; rechazos de BD (numeración duplicada, inmutabilidad de SPEC 36/39) llegan con mensaje en español. Verificado en vivo: el duplicado `FF01-00014` devolvió "Ya registraste una venta con ese número de comprobante.".
- [x] El botón Imprimir muerto ya no existe en ninguna columna; el botón `Wallet` del listado sigue abriendo el wizard en el listado.
- [x] Los archivos `sale-modal`, `purchase-modal`, `sale-detail-modal`, `purchase-detail-modal`, `sale-form` y `purchase-form` ya no existen en el repo.
- [x] `npm run lint`, `npm test` y `npm run build` pasan; los e2e adaptados pasan contra el dev server con el seed documentado. Verificado: 422 tests, build con las 8 rutas y 3/3 e2e en verde.

## Decisions

- **Sí:** aplanar rutas y URLs cortas (`/ventas` en vez de `/ventas/listado`) — elección del usuario. **No:** redirect de las URLs viejas — uso interno, sin enlaces externos.
- **Sí:** vistas client que cargan el comprobante por id con un getter nuevo (patrón dominante del módulo, providers 100 % client). **No:** fetch server-side del comprobante — duplicaría el getter (browser/server) sin ganancia.
- **Sí:** unificación total en `components/comprobantes/` parametrizada por `voucherKind` (formulario, vistas de registro/edición y detalle, un test fusionado). **No:** mantener los árboles espejo. **No:** unificar también `listSales`/`listPurchases` y los providers — otra spec.
- **Sí:** un solo schema de formulario (`voucherFormSchema`, campo `entityId`) sobre `lib/schemas/voucher.ts` de SPEC 39, mapeando a los payloads existentes. **No:** tocar los schemas de módulo ni la BD.
- **Sí:** página de registro en una pantalla con las tres secciones del modal. **No:** asistente por pasos — formulario corto, menos clicks.
- **Sí:** tras guardar, redirigir al detalle del comprobante. **No:** volver al listado — desde el detalle puedes registrar el pago al instante.
- **Sí:** detalle mantiene banda + pestañas de SPEC 24 tal cual; la página solo añade cabecera con identidad (tipo + número) y "Registrar pago" (wizard de SPEC 25 reutilizado, montado también en la página de detalle). **No:** rediseñar el contenido del detalle ni el wizard.
- **Sí:** eliminar el botón Imprimir de las columnas (código muerto). **No:** implementar impresión de comprobantes — otra spec si llega.
- **Sí:** el navbar marca activo por prefijo de segmento. **No:** comparación por igualdad exacta (rompería el activo en las páginas hijas).

## Risks

| Riesgo | Mitigación |
| --- | --- |
| Las rutas tipadas de Next 16 rechazan hrefs no declarados | Ventaja: el build valida cada `router.push`/`Link`; corregir en el mismo paso. |
| El wizard `NestedPaymentDrawers` (770 líneas, 15 props acopladas) se monta ahora en dos lugares (listado y detalle) | Componente intacto; el detalle le pasa el `Voucher` cargado; el e2e `registrar-pago-y-ver-saldo` cubre ambos flujos. |
| Regresión en compras al unificar el formulario (hoy sin guard de RUC) | Test fusionado con casos por kind: guard RUC solo VENTA, proveedores ad-hoc solo COMPRA, `isPaidLocked` en ambos. |
| Los e2e existentes acoplan "Ver" → modal → pestañas | Se adaptan en el paso final (seed y requisitos ya documentados en sus headers). |
| Convivencia modal/página durante la migración | El plan está ordenado para que cada paso deje el sistema funcional; el rewire del listado es el último paso antes de borrar los modales. |
| Datos desactualizados al editar (otro usuario cambia el comprobante) | Mejora respecto de hoy: la página de edición carga por id al montarse; la BD valida al guardar (SPEC 36/39). |

## What is **not** in this spec

- Notas y retenciones (SPEC 39/40): mantienen su flujo actual.
- Impresión de comprobantes y redirect de URLs viejas.
- Unificación del data layer de listados, providers y catálogo `sale-options`.
- Deep links con prefill, baja/anulación de comprobantes y cambios de esquema.

Cada uno de esos, si llega, va en su propia spec.

## Verificación

**Fecha:** 2026-10-22 · **Rama:** `spec-41-paginas-ventas-compras` (commits `20a39ba`…`6335cbb`, fix `6dce6f5`, verificación `5310fa9`) · **Verificación:** agente `spec-verifier` + pruebas de mutación y e2e asistidas.

### Comandos ejecutados

| Comando | Resultado |
| --- | --- |
| `npm run lint` | ✅ sin errores ni warnings |
| `npm test` | ✅ 47 archivos, 422 tests |
| `npm run build` | ✅ incluye `/ventas`, `/ventas/nuevo`, `/ventas/[id]`, `/ventas/[id]/editar`, `/compras`, `/compras/nuevo`, `/compras/[id]`, `/compras/[id]/editar` |

Comprobaciones de código: `getVoucherById` (fila de `comprobante` + `voucher_balance`, filtros tipo base/`deleted_at`, `PGRST116` → `null`), `voucherFormSchema` con `entityId`, `useVoucher`, `types.ts` con `Voucher` compartido, guard RUC solo en VENTA, `isPaidLocked`, navbar por prefijo (`isPathActive`), columnas de ventas y compras con Ver/Editar/Wallet y sin `Printer`, y ausencia de los 6 archivos de modales/formularios viejos (búsqueda global; solo quedan `Printer` legítimos en `payment-history-section` y `payments-columns`).

Recomendaciones de Next.js 16 contrastadas con Context7 (`/vercel/next.js`): `PageProps<"/ruta">` + `await params` en las páginas dinámicas y `searchParams` como `Promise` en los listados — coinciden con la implementación.

### Pantallas probadas (Playwright, dev server en `:3000` con `USUARIO`/`PASSWORD` de `.env`)

- `/ventas`: listado con filtros (Desde/Hasta/Estado pago), buscador, Ver/Editar/Wallet por fila, sin Imprimir; navbar "Ventas" activo (`aria-current="page"`, pill verde). Filtros por URL `?estado=PENDIENTE&desde=2026-09-01` filtran filas correctamente.
- `/ventas/nuevo`: Volver + "Registrar venta", secciones "Datos del comprobante", "Montos", "Condición de pago", botones Cancelar/Registrar, selector de cliente con RUC visible y aviso "Para emitir factura, el cliente debe tener RUC"; al elegir cliente con RUC el tipo pasa a Factura y el aviso desaparece. Sin guardar.
- `/ventas/[id]` (FF01-00011, PENDIENTE): título "Factura FF01-00011", "Cliente: …", badge "Pendiente", banda Total/Abonado/Saldo, tabs "Datos del comprobante"/"Historial de pagos".
- `/ventas/[id]` (FF01-00014, PAGADO): tab Historial con 3 recibos y "Imprimir recibo" → diálogo "Recibo" con vista previa 80 mm (solo lectura).
- `/ventas/[id]/editar`: formulario precargado (fecha, tipo, número, cliente, total, condición, estado) y título "Editar venta"; en un comprobante con pagos aparece el aviso de bloqueo y los campos fecha/número/cliente/total quedan deshabilitados.
- Wizard "Registrar pago" abierto desde el detalle y desde el listado (Wallet) y cerrado con Cancelar: sin cambios en banda, badge ni datos.
- `id` inexistente en `/ventas/[id]`, `/ventas/[id]/editar`, `/compras/[id]` y `/compras/[id]/editar`: "Comprobante no encontrado" + Volver, HTTP 200, sin crash.
- `/compras`: listado con filtros y "Registrar compra"; `/compras/nuevo`: "Registrar compra", secciones y selector de proveedor, sin aviso de RUC (el guard es solo de ventas).
- Consola del navegador: 0 errores en `/ventas`, `/ventas/nuevo`, detalle y edición tras la corrección descrita abajo.

Capturas en `.playwright-mcp/`: `spec41-ventas-nuevo.png`, `spec41-ventas-nuevo-cliente-selector.png`, `spec41-venta-detalle-pendiente.png`, `spec41-venta-detalle-historial.png`, `spec41-detalle-recibo-dialog.png`, `spec41-venta-editar-precargado.png`, `spec41-venta-editar-bloqueado.png`, `spec41-detalle-wizard-paso1.png`, `spec41-detalle-no-encontrado.png`, `spec41-compras-nuevo.png`, `spec41-venta-registrada.png`, `spec41-venta-editada.png`, `spec41-rechazo-duplicado.png`, `spec41-pago-registrado.png`, `spec41-pago-historial.png`, `spec41-pago-parcial-historial.png`.

### Verificación final con mutaciones y e2e (2026-10-22)

Con autorización del usuario se probaron los flujos que escriben en la BD:

- **Alta:** `/ventas/nuevo` → `FT01-90001` (Factura, BODEGA LA ESPERANZA EIRL, S/ 180, contado). Guardó, redirigió a `/ventas/1b9f6068-…` y mostró "Venta registrada".
- **Edición:** `/ventas/1b9f6068-…/editar` con formulario precargado; total S/ 150 → S/ 180, guardó, redirigió al detalle y mostró "Venta actualizada".
- **Rechazo de BD:** intento de guardar `FF01-00014` duplicado en la venta anterior; toast "Ya registraste una venta con ese número de comprobante." y la edición permaneció abierta, sin cambios.
- **Pago total desde el detalle:** wizard 4/4, método Efectivo, cuenta Caja General, S/ 180 → `RI-000016`; banda Abonado S/ 180 / Saldo S/ 0, badge Pagado e historial con el recibo.
- **Pago parcial en FF01-00010:** S/ 1.00 → `RI-000017`; banda Abonado S/ 1 / Saldo S/ 4,129 y el historial se actualizó en la misma página, sin recargar.
- **e2e:** `npm run test:e2e` → **3/3 en 46.4 s**. `registrar-nota-credito-y-ver-saldo` creó `FC01-635889` (S/ 10) sobre FF01-00011; `registrar-pago-y-ver-saldo` pagó el saldo restante de FF01-00011 (`RI-000018`, S/ 1,465) y verificó el detalle; `validacion-reparto-en-vivo` pasó sin mutar.
- **Comandos:** `npm run lint`, `npm test` (422) y `npm run build` re-ejecutados tras el fix: verdes.

Datos de prueba creados: venta `FT01-90001` (Pagada), pagos `RI-000016`, `RI-000017` y `RI-000018`, y nota de crédito `FC01-635889`. El dev server de `:3000` se reinició y ya sirve `/compras/nuevo` y `/compras/[id]/editar`.

### Criterios pendientes

Ninguno. Los 10 criterios de aceptación quedaron verificados con evidencia.

### Hallazgos

1. **Corregido — error de consola de Base UI en el formulario.** El botón "Cancelar" de `voucher-form-view.tsx` se renderizaba con `Button render={<Link …>}` y emitía `A component that acts as a button expected a native <button>…`. Según la documentación de Base UI (Context7), un enlace no debe renderizarse con el `render` de `Button`: ahora es un `<Link>` con `buttonVariants({ variant: "outline" })`. Consola limpia y `lint`/`test`/`build` en verde tras el cambio (pasa igual en el formulario de compras, que comparte la vista).
2. **Entorno — tabla de rutas obsoleta del dev server (resuelto).** En `:3000`, `/compras/nuevo` y `/compras/[id]/editar` devolvían 404 aunque los archivos existen y el build los genera; el `app-paths-manifest` de `.next/dev` no incluía `compras/[id]/editar` y aún listaba rutas borradas (`ventas/listado`, `compras/listado`). Se reinició el dev server el 2026-10-22 y ambas rutas responden correctamente; no era un defecto de código.
3. **Datos de desarrollo:** 6 entidades, todas cliente (`is_supplier = false`) y 0 compras, por lo que el selector de proveedor muestra "No hay entidades disponibles" y el listado de compras está vacío. Es estado de la BD, no regresión: el formulario de compras usa el mismo `listSuppliers()` de antes.
4. Observación menor (fuera de alcance, SPEC 24): en FF01-00014 la banda muestra "SALDO POR PAGAR −S/ 50.00" (saldo negativo por notas aplicadas); la banda no se tocó en esta spec.
