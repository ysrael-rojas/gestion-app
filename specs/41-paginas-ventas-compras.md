# SPEC 41 — Páginas de registro, edición y detalle para comprobantes de ventas y compras

> **Status:** Aprobado
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

- [ ] `/ventas` y `/compras` muestran el listado con filtros por URL igual que antes; el navbar marca "Ventas" activa en `/ventas`, `/ventas/nuevo`, `/ventas/[id]` y `/ventas/[id]/editar` (ídem "Compras").
- [ ] "Registrar venta" del listado navega a `/ventas/nuevo`; la página muestra Volver + título "Registrar venta" y las tres secciones (Datos del comprobante, Montos, Condición de pago); guardar redirige al detalle del comprobante creado con toast "Venta registrada".
- [ ] El botón Editar de una fila navega a `/ventas/[id]/editar` con el formulario precargado; guardar redirige al detalle con toast "Venta actualizada".
- [ ] El botón Ver de una fila navega a `/ventas/[id]`: cabecera con Volver, título con tipo + número, entidad y badge de estado; banda con Total/Abonado/Saldo; pestañas "Datos del comprobante" e "Historial de pagos" con el recibo imprimible.
- [ ] En el detalle de un comprobante PENDIENTE existe "Registrar pago" que abre el wizard de 4 drawers (SPEC 25) y al registrar actualiza banda, badge e historial sin recargar la página.
- [ ] Un `id` inexistente o anulado en la URL muestra un estado "no encontrado" con botón Volver, sin crash.
- [ ] Reglas intactas: FACTURA exige RUC en ventas (no en compras); campos bloqueados cuando `paidAmount > 0`; rechazos de BD (numeración duplicada, inmutabilidad de SPEC 36/39) llegan con mensaje en español.
- [ ] El botón Imprimir muerto ya no existe en ninguna columna; el botón `Wallet` del listado sigue abriendo el wizard en el listado.
- [ ] Los archivos `sale-modal`, `purchase-modal`, `sale-detail-modal`, `purchase-detail-modal`, `sale-form` y `purchase-form` ya no existen en el repo.
- [ ] `npm run lint`, `npm test` y `npm run build` pasan; los e2e adaptados pasan contra el dev server con el seed documentado.

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
