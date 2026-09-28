# SPEC 05 — Listado, registro y edición de ventas (cabecera)

> **Status:** Implementado
> **Depends on:** SPEC 01, SPEC 03, SPEC 04
> **Date:** 2026-09-28
> **Objective:** Construir en `/ventas/listado` un data table en memoria de comprobantes de venta (solo cabecera) con modal de registro/edición, selección de cliente existente, cálculo automático de subtotal e IGV desde el total y el ítem VENTAS en el sidebar.

## Scope

**In:**

- Compartir el estado de clientes: crear `components/clientes/clientes-provider.tsx` (Context en memoria) y refactorizar `app/clientes/listado/page.tsx` para consumirlo.
- Montar `ClientesProvider` en `app/layout.tsx`, envolviendo `{children}`.
- Ruta `app/ventas/listado/page.tsx` con data table de ventas en memoria (mismo patrón que `/clientes/listado`).
- Botón **Registrar venta** que abre un `Dialog` con el formulario de alta.
- Formulario `react-hook-form` + `zod` con campos: fecha emisión, fecha registro (solo lectura, automática), tipo comprobante, nro comprobante, cliente (select de clientes existentes), total, subtotal (solo lectura), IGV 18 % (solo lectura), tipo pago, estado.
- Cálculo automático al escribir el **total**: `subtotal = total / 1.18`, `igv = total − subtotal`, redondeo a 2 decimales.
- Acciones por fila: **Ver** (modal de detalle), **Imprimir** (botón placeholder, sin acción) y **Editar** (reutiliza el modal).
- Ítem **VENTAS** de primer nivel en el sidebar → `/ventas/listado`, con estado activo.
- Toast de éxito al guardar.

**Out of scope (for future specs):**

- Backend, API, base de datos, autenticación y persistencia entre recargas.
- Productos/líneas de detalle del comprobante (solo cabecera).
- **Anular** ventas (diferido; no hay estado ANULADO).
- Forma pago, cuotas/abonos y todo el módulo de pagos.
- Acción real de **Imprimir** (queda como placeholder).
- Eliminar ventas, exportación, filtros por columna y acciones masivas.
- Cambios en la lógica de validación, datos o UI de clientes más allá de mover su estado al provider.

## Data model

```ts
// components/ventas/types.ts
export type VoucherType = "FACTURA" | "BOLETA" | "NOTA_VENTA";
export type PaymentType = "CONTADO" | "CREDITO";
export type SaleStatus = "PAGADO" | "PENDIENTE";

export interface Sale {
  id: string;                // crypto.randomUUID()
  issueDate: string;         // "YYYY-MM-DD" (fecha emisión, editable)
  registrationDate: string;  // "YYYY-MM-DD" (fecha actual, automática)
  voucherType: VoucherType;
  voucherNumber: string;     // Nro comprobante (manual)
  clientId: string;          // referencia a Client del ClientesProvider
  subtotal: number;          // calculado: total / 1.18 (2 decimales)
  igv: number;               // calculado: total − subtotal (2 decimales)
  total: number;             // ingresado por el usuario
  paymentType: PaymentType;
  status: SaleStatus;        // nueva venta: PENDIENTE por defecto
}
```

```ts
// lib/schemas/sale.ts (zod)
// issueDate: requerido
// voucherType: enum FACTURA | BOLETA | NOTA_VENTA
// voucherNumber: requerido (min 1)
// clientId: requerido (min 1)
// total: número > 0
// paymentType: enum CONTADO | CREDITO
// status: enum PAGADO | PENDIENTE
// subtotal e igv NO se capturan: se derivan en la página al guardar
```

```ts
// lib/ventas/amounts.ts
export function calculateAmounts(total: number) {
  const subtotal = round(total / 1.18, 2);
  const igv = round(total - subtotal, 2);
  return { subtotal, igv, total };
}
```

Convenciones:

- Nombres de campos y tipos en inglés, `camelCase` (AGENTS.md).
- Textos de UI en español.
- Catálogos en `lib/data/sale-options.ts`: `VOUCHER_TYPES` (Factura, Boleta, Nota de venta), `PAYMENT_TYPES` (Contado, Crédito), `SALE_STATUSES` (Pagado, Pendiente), con `DEFAULT_SALE_STATUS = "PENDIENTE"`.
- Fecha en UI `dd/mm/aaaa`; moneda `S/ 1,234.56` (helper de formato en `lib/utils.ts`).
- El nombre del cliente se resuelve por `clientId` contra `useClientes()`; si no existe, se muestra "Cliente no encontrado".

## Implementation plan

1. Crear `components/clientes/clientes-provider.tsx` (`"use client"`: `ClientesProvider` + `useClientes()` con `clients`, `addClient`, `updateClient`, `removeClient`) y montarlo en `app/layout.tsx`. Verificar `npm run build`.
2. Refactorizar `app/clientes/listado/page.tsx` para usar `useClientes()` en lugar de su `useState`. Verificar que registrar/editar/eliminar/ver sigan funcionando; `npm run lint` y `npm run build`.
3. Crear `components/ventas/types.ts`, `lib/data/sale-options.ts`, `lib/ventas/amounts.ts` y `lib/schemas/sale.ts`. Verificar `npm run lint`.
4. Crear `app/ventas/listado/page.tsx` (client) con estado `sales`, `modalOpen`, `editingSale`, `viewingSale`; `handleSave` calcula `subtotal`/`igv` y fija `registrationDate` con la fecha local.
5. Crear `components/ventas/sale-form.tsx` (react-hook-form + zod): select de cliente desde `useClientes()`, total editable y subtotal/IGV de solo lectura recalculados con `useWatch`.
6. Crear `components/ventas/sale-modal.tsx` (mismo `Card`/`Dialog` de `client-modal.tsx`, títulos "Registrar venta" / "Editar venta").
7. Crear `components/ventas/sale-detail-modal.tsx` (agrupa "Datos del comprobante" y "Montos", con botón **Cerrar**).
8. Crear `components/ventas/sales-columns.tsx` y `components/ventas/sales-data-table.tsx` (columnas: Fecha emisión, Tipo comprobante, Nro comprobante, Cliente, Total, Tipo pago, Estado; acciones Ver, Imprimir, Editar).
9. Añadir el ítem **VENTAS** en `components/app-sidebar.tsx` (ícono `Receipt`, `Link` a `/ventas/listado`, activo con `usePathname`).
10. Verificar `npm run lint` y `npm run build`.

## Acceptance criteria

- [x] `ClientesProvider` está montado en `app/layout.tsx` y `app/clientes/listado/page.tsx` consume `useClientes()` sin regresiones.
- [x] `/ventas/listado` renderiza sin errores en consola.
- [x] El botón **Registrar venta** abre el modal con el formulario vacío; fecha emisión = hoy y fecha registro = hoy (solo lectura).
- [x] El select de cliente lista los clientes registrados en `/clientes/listado`.
- [x] Al escribir el total, subtotal e IGV se calculan solos (`subtotal = total / 1.18`) con 2 decimales y no son editables.
- [x] Enviar sin tipo comprobante, nro, cliente, tipo pago o con total ≤ 0 muestra errores y no envía.
- [x] Un envío válido muestra toast de éxito, cierra el modal, limpia el formulario y agrega una fila con estado PENDIENTE.
- [x] La tabla muestra las columnas Fecha emisión, Tipo comprobante, Nro comprobante, Cliente, Total, Tipo pago y Estado.
- [x] La búsqueda global y la paginación funcionan.
- [x] **Ver** abre el detalle con fecha registro, montos y datos del cliente.
- [x] **Imprimir** aparece en la fila pero no ejecuta ninguna acción.
- [x] **Editar** abre el modal con título "Editar venta" y campos precargados; guardar actualiza la fila sin duplicarla.
- [x] El sidebar muestra el ítem **VENTAS** que navega a `/ventas/listado` y se resalta como activo.
- [x] Recargar la página borra las ventas (solo memoria).
- [x] `npm run lint` y `npm run build` pasan.

## Decisions

- **Sí:** `ClientesProvider` (Context en memoria) en el layout, para que el selector de ventas vea los clientes reales; se refactoriza la página de clientes.
- **Sí:** cliente por selector de existentes (no texto libre).
- **Sí:** total es el campo de entrada; subtotal e IGV son de solo lectura calculados.
- **Sí:** fecha emisión por defecto hoy y editable; fecha registro automática y de solo lectura.
- **Sí:** nro comprobante manual y requerido, sin validación de unicidad.
- **Sí:** estados PAGADO/PENDIENTE; nueva venta nace PENDIENTE y el estado es editable en el formulario.
- **Sí:** solo tipo pago (Contado/Crédito) en el formulario; forma pago va al módulo de pagos.
- **Sí:** del lado de la UI, formato `dd/mm/aaaa` y `S/`.
- **No:** Anular (diferido; no hay estado ANULADO).
- **No:** eliminar ventas.
- **No:** acción real de Imprimir (placeholder).
- **No:** productos/líneas, backend, persistencia ni módulo de pagos.

## Risks

| Riesgo | Mitigación |
| --- | --- |
| El refactor de clientes al provider rompe SPEC 01/03 | Mantener la misma API/UI en la página; el hook expone las mismas operaciones; verificar lint/build y el flujo registrar/editar/eliminar/ver. |
| El selector queda vacío si aún no hay clientes | Mostrar placeholder "No hay clientes" y bloquear el guardado hasta elegir uno. |
| Redondeo de IGV no cuadra exactamente con el total | Calcular `igv = total − subtotal` redondeando recién al final, con 2 decimales. |
| Una venta referencia un cliente eliminado | Resolver nombre por `clientId`; si no existe, mostrar "Cliente no encontrado". |
| `registrationDate` depende de la zona horaria | Construir la fecha con los componentes locales (no `toISOString()`). |
| "Imprimir" es placeholder y puede confundirse con funcional | Etiquetarlo como pendiente en la spec y no asignarle handler. |

## What is **not** in this spec

- Backend, API, base de datos, autenticación o persistencia.
- Productos/líneas del comprobante.
- Anular y eliminar ventas.
- Forma pago, cuotas/abonos y módulo de pagos.
- Acción real de Imprimir.
- Cambios de lógica de clientes más allá de mover su estado al provider.

Cada uno de esos, si aparece, va en su propia spec.
