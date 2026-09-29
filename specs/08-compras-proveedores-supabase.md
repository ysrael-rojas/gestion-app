# SPEC 08 — Compras: UI y persistencia en Supabase

> **Status:** Aprobado
> **Depends on:** SPEC 06, SPEC 07
> **Date:** 2026-09-29
> **Objective:** Implementar el listado, registro y edición de compras en `/compras/listado` reutilizando la tabla `comprobante` con `voucher_kind = 'COMPRA'`, añadiendo el ítem **COMPRAS** al sidebar y permitiendo marcar una entidad como proveedor en el formulario de clientes.

## Scope

**In:**

- Añadir el campo `isSupplier` al formulario de clientes (`components/clientes/client-form.tsx`) como checkbox **"Es proveedor"**, manteniendo **"Es cliente"** implícito para todo registro desde `/clientes/listado`.
- Actualizar `lib/schemas/client.ts`, `components/clientes/types.ts`, `lib/clientes/entidades.ts` y `components/clientes/clientes-provider.tsx` para soportar `is_supplier` en creación/actualización y consulta.
- Crear una función `listSuppliers()` que devuelva entidades con `is_supplier = true` (clientes-proveedores incluidos), para el selector de compras.
- Crear `components/compras/types.ts` con el tipo `Purchase` (igual estructura que `Sale`, con `supplierId` mapeado a `entityId`).
- Crear `lib/comprobantes/compras.ts` con `listPurchases`, `createPurchaseRecord`, `updatePurchaseRecord` y el mapeo a `voucher_kind = 'COMPRA'`.
- Crear `components/compras/compras-provider.tsx` (provider asíncrono) y montarlo en `app/layout.tsx`.
- Crear `app/compras/listado/page.tsx` con data table, modal de registro/edición, modal de detalle, toast de éxito/error y skeleton de carga.
- Crear `components/compras/purchase-form.tsx`, `purchase-modal.tsx`, `purchase-detail-modal.tsx`, `purchases-columns.tsx` y `purchases-data-table.tsx` replicando el patrón de ventas.
- Añadir el ítem **COMPRAS** en `components/app-sidebar.tsx` como ítem de primer nivel junto a **VENTAS**, con ícono y estado activo.
- Verificar `npm run lint` y `npm run build`.

**Out of scope (for future specs):**

- Página independiente de proveedores (`/proveedores/listado`).
- Productos/líneas de detalle del comprobante (solo cabecera).
- Módulo de pagos, cuotas, abonos y automatización del estado PAGADO/PENDIENTE.
- Anular y eliminar comprobantes de compra.
- Acción real de **Imprimir** (sigue como placeholder).
- Autenticación, RLS por usuario y paginación/búsqueda/orden en el servidor.
- Cambiar la etiqueta del menú de **Clientes/Proveedores** o reorganizar la navegación más allá de añadir **COMPRAS**.

## Data model

La tabla `public.comprobante` de SPEC 07 ya soporta `voucher_kind = 'COMPRA'`. No se crean nuevas tablas. Los únicos cambios de esquema son lógicos: `entidad.is_supplier` pasa a ser editable desde la UI de clientes.

Tipo de UI en `components/compras/types.ts`:

```ts
export type VoucherType = "FACTURA" | "BOLETA" | "NOTA_VENTA";
export type PaymentType = "CONTADO" | "CREDITO";
export type PurchaseStatus = "PAGADO" | "PENDIENTE";

export interface Purchase {
  id: string;
  issueDate: string;         // "YYYY-MM-DD"
  registrationDate: string;  // "YYYY-MM-DD"
  voucherType: VoucherType;
  voucherNumber: string;
  supplierId: string;        // FK a entidad.id (proveedor en la UI de compras)
  subtotal: number;
  igv: number;
  total: number;
  paymentType: PaymentType;
  creditDays: number | null; // requerido si CREDITO; null si CONTADO
  dueDate: string | null;    // calculada: issueDate + creditDays
  status: PurchaseStatus;
}
```

Esquema zod en `lib/schemas/purchase.ts` (replica de `sale.ts` con `supplierId`):

```ts
// entityId → supplierId; mismas reglas de crédito y cálculo
```

Capa de datos en `lib/comprobantes/compras.ts`:

```ts
// listPurchases(): Purchase[]  → voucher_kind='COMPRA' and deleted_at is null
// createPurchaseRecord(values): Purchase
// updatePurchaseRecord(id, values): Purchase
// mapPurchaseValues / mapPurchaseRow → snake_case ↔ Purchase
```

Convenciones:

- Nombres de campos y tipos en inglés `camelCase` (AGENTS.md).
- Textos de UI en español: "Proveedor", "Registrar compra", "Editar compra".
- Moneda `S/ 1,234.56` y fecha `dd/mm/aaaa`.
- El nombre del proveedor se resuelve por `supplierId` contra `useClientes()`; si no existe, "Proveedor no encontrado".

## Implementation plan

1. Actualizar `lib/schemas/client.ts` con `isSupplier: z.boolean().default(false)` (o `optional().default(false)`).
2. Actualizar `components/clientes/types.ts` para incluir `isSupplier?: boolean` en `Client` (solo si hace falta para el mapeo).
3. Actualizar `lib/clientes/entidades.ts`: `mapFormValues` incluye `is_supplier`; `createClientRecord` y `updateClientRecord` usan el valor enviado; añadir `listSuppliers()` que filtre `is_supplier = true` y `deleted_at is null`.
4. Actualizar `components/clientes/client-form.tsx` con checkbox **"Es proveedor"** y precargar el valor en edición.
5. Verificar `/clientes/listado`: crear/editar sigue funcionando y puede marcar/desmarcar proveedor; `npm run lint` y `npm run build`.
6. Crear `components/compras/types.ts`, `lib/schemas/purchase.ts`, `lib/comprobantes/compras.ts` y `components/compras/compras-provider.tsx`.
7. Montar `ComprasProvider` en `app/layout.tsx`.
8. Crear `app/compras/listado/page.tsx` y los componentes `purchase-form.tsx`, `purchase-modal.tsx`, `purchase-detail-modal.tsx`, `purchases-columns.tsx`, `purchases-data-table.tsx` (replicar patrón de ventas, selector de proveedores desde `listSuppliers`).
9. Añadir **COMPRAS** a `components/app-sidebar.tsx` como ítem de primer nivel junto a **VENTAS**.
10. Verificar `npm run lint` y `npm run build`.

## Acceptance criteria

- [ ] `lib/schemas/client.ts` incluye `isSupplier` y el formulario muestra el checkbox **"Es proveedor"**.
- [ ] Crear un cliente marcado como proveedor guarda `is_supplier = true` en `entidad`; editar permite cambiarlo.
- [ ] `listSuppliers()` devuelve entidades con `is_supplier = true` (incluyendo las que también son clientes).
- [ ] Existe `components/compras/types.ts` con el tipo `Purchase` y `lib/schemas/purchase.ts` con las validaciones equivalentes a ventas.
- [ ] Existe `lib/comprobantes/compras.ts` con `listPurchases`, `createPurchaseRecord`, `updatePurchaseRecord` y mapeo a `voucher_kind = 'COMPRA'`.
- [ ] `ComprasProvider` está montado en `app/layout.tsx`.
- [ ] `/compras/listado` renderiza sin errores en consola.
- [ ] El botón **Registrar compra** abre el modal con formulario vacío; fecha emisión y fecha registro = hoy.
- [ ] El selector de proveedor lista solo entidades con `is_supplier = true`.
- [ ] Al escribir el total, subtotal e IGV se calculan solos (`subtotal = total / 1.18`) con 2 decimales.
- [ ] Al elegir **Crédito**, aparece **Días de crédito** (default 30) y **Fecha de vencimiento** se actualiza sola; con **Contado** ambos se ocultan.
- [ ] Enviar sin tipo comprobante, nro, proveedor, tipo pago o con total ≤ 0 muestra errores y no envía.
- [ ] Un envío válido inserta en `comprobante` con `voucher_kind = 'COMPRA'`, muestra toast de éxito, cierra el modal y agrega la fila.
- [ ] La tabla muestra las columnas: Fecha emisión, Tipo comprobante, Nro comprobante, Proveedor, Total, Tipo pago, Estado, Días crédito, Fecha vencimiento.
- [ ] **Ver** abre el detalle con fecha registro, montos y datos del proveedor.
- [ ] **Imprimir** aparece pero no ejecuta acción.
- [ ] **Editar** abre el modal precargado y actualiza la misma fila sin duplicarla.
- [ ] El sidebar muestra **COMPRAS** como ítem de primer nivel, navega a `/compras/listado` y se resalta como activo.
- [ ] `npm run lint` y `npm run build` pasan.

## Decisions

- **Sí:** reutilizar la tabla `comprobante` de SPEC 07 con `voucher_kind = 'COMPRA'`; no se altera el esquema.
- **Sí:** el selector de compras lista entidades con `is_supplier = true`, incluyendo aquellas que también son clientes.
- **Sí:** la forma de convertir una entidad en proveedor es mediante un checkbox en el formulario de clientes existente; no se crea una página de proveedores en esta spec.
- **Sí:** los componentes de compras replican el patrón de ventas (formulario, modal, detalle, columnas, provider), adaptando etiquetas y el selector.
- **Sí:** `is_client` sigue siendo `true` para todo registro desde `/clientes/listado`; el checkbox solo controla `is_supplier`.
- **Sí:** mismo cálculo de subtotal/IGV, días de crédito, fecha de vencimiento y estados PAGADO/PENDIENTE que en ventas.
- **Sí:** nro de comprobante manual y requerido, sin validación de unicidad.
- **No:** página independiente de proveedores.
- **No:** anular, eliminar, imprimir real, productos/líneas, módulo de pagos ni auth.
- **No:** cambiar la organización del sidebar más allá de añadir **COMPRAS** como ítem de primer nivel.

## Risks

| Riesgo | Mitigación |
| --- | --- |
| El checkbox de proveedor confunde al usuario de clientes | Etiqueta clara "Es proveedor" y mantener el flujo de clientes intacto. |
| `is_supplier` cambia mientras hay compras asociadas | Permitido; la compra conserva su `entity_id` histórico. |
| El selector de proveedores queda vacío si no se marca ningún cliente como proveedor | Mostrar placeholder "No hay proveedores" y requerir uno antes de guardar. |
| Duplicación de código entre ventas y compras | Aceptado en esta spec; en el futuro se puede extraer componentes compartidos de comprobantes. |
| Editar una compra de Crédito a Contado deja datos huérfanos | El formulario limpia `creditDays` al cambiar y el check de DB lo valida. |

## What is **not** in this spec

- Página independiente de proveedores.
- Productos/líneas del comprobante.
- Módulo de pagos y automatización del estado.
- Anular, eliminar y acción real de Imprimir.
- Autenticación, RLS por usuario y búsqueda/orden/paginación en el servidor.
- Reestructuración del sidebar más allá de añadir **COMPRAS**.

Cada uno de esos, si aparece, va en su propia spec.