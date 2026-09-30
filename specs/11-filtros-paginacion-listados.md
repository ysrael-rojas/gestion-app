# SPEC 11 — Filtros externos, paginación completa y columna Estado Pago en listados de ventas y compras

> **Status:** Aprobado
> **Depends on:** SPEC 07, SPEC 08, SPEC 10
> **Date:** 2026-09-29
> **Objective:** Mejorar los listados de ventas y compras con filtros externos (rango por fecha de emisión y estado de pago) persistidos en `searchParams`, paginación completa, columna `Estado` renombrada a `Estado Pago` con colores rojo/verde, y una fila superior que combina filtros a la izquierda y el botón de registrar a la derecha.

## Why this spec exists

Los listados de `/ventas/listado` y `/compras/listado` solo ofrecen búsqueda libre por texto arriba del datatable y dos botones "Anterior / Siguiente" al pie. No hay forma de acotar por fecha ni por estado de pago — el usuario tiene que leer cada fila para detectar pendientes. La columna "Estado" muestra texto plano, así que el código de color que distingue PAGADO/PENDIENTE — el que dispara todas las acciones siguientes (Registrar pago) — es invisible a primera vista. SPEC 10 ya estandarizó el patrón `searchParams` para `/pagos/*`; esta spec lo replica en los listados de comprobantes y, de paso, les da la paginación completa que les falta.

## Scope

**In:**

- Filtros y paginación para `/ventas/listado` y `/compras/listado`.
- Filtro de fecha rango (`desde` / `hasta`) sobre `issueDate` (Fecha emisión), inclusivo en ambos extremos.
- Filtro de estado de pago con opciones `Todos` (default), `Pagado`, `Pendiente`.
- Fila superior (`ListingsToolbar`) compartida por ambas páginas: filtros a la izquierda y el botón `Registrar venta` / `Registrar compra` a la derecha (slot `children`).
- El input de búsqueda libre "Buscar ventas/compras" **se queda donde está hoy** (sobre el datatable, debajo de la fila de filtros).
- Persistencia de filtros en URL `searchParams`: `desde`, `hasta`, `estado`. Patrón idéntico a SPEC 10 (`await searchParams` en la página, parseo tolerante, default "Todos" no se serializa).
- Paginación completa: contador `Mostrando X–Y de Z`, selector de tamaño (10/25/50/100, default 10), números de página con elipsis cuando hay más de 5, botones `Anterior` / `Siguiente`.
- Componente `PaymentStatusBadge` compartido: badge verde para PAGADO, rojo para PENDIENTE, con buen contraste en modo claro y oscuro (no hex hardcodeados).
- Renombrar la columna `Estado` → `Estado Pago` en `sales-columns.tsx` y `purchases-columns.tsx`.

**Out of scope (for future specs):**

- Filtros por cliente/proveedor, tipo de comprobante, fecha de vencimiento, rango de totales.
- Paginación o filtrado server-side.
- Guardar combinaciones favoritas de filtros.
- Operadores AND/OR entre columnas.
- Nuevos valores para `status` (sigue siendo solo `PAGADO` / `PENDIENTE`).
- Quitar o reubicar el input de búsqueda libre.
- Cambios al formulario de alta ni a la lógica de pagos.

## Data model

Esta spec no crea tablas ni migraciones. Reutiliza los tipos `Sale` y `Purchase` existentes (SPEC 07/08) y define solo el modelo de filtros.

```ts
// lib/filters/listado-filters.ts
export type PaymentStatusFilter = "TODOS" | "PAGADO" | "PENDIENTE";

export interface ListadoFilters {
  desde: string | null;        // "YYYY-MM-DD" o null
  hasta: string | null;        // "YYYY-MM-DD" o null
  estado: PaymentStatusFilter; // default "TODOS"
}

export const DEFAULT_PAYMENT_STATUS_FILTER: PaymentStatusFilter = "TODOS";

export const PAYMENT_STATUS_FILTER_OPTIONS: {
  value: PaymentStatusFilter;
  label: string;
}[] = [
  { value: "TODOS", label: "Todos" },
  { value: "PAGADO", label: "Pagado" },
  { value: "PENDIENTE", label: "Pendiente" },
];

export function parseListadoFilters(
  params: Record<string, string | string[] | undefined>
): ListadoFilters;
// - "desde" / "hasta": valida con regex ^\d{4}-\d{2}-\d{2}$; inválido -> null
// - "estado": acepta "PAGADO" | "PENDIENTE"; cualquier otro valor -> "TODOS"
// - el default completo es { desde: null, hasta: null, estado: "TODOS" }

export function filtersToSearchParams(filters: ListadoFilters): URLSearchParams;
// - serializa solo lo no-default (estado="TODOS" -> se omite)

export function applyListadoFilters<T extends { issueDate: string; status: string }>(
  rows: T[],
  filters: ListadoFilters
): T[];
// - filtra por issueDate en [desde, hasta] cuando vienen
// - filtra por status cuando estado != "TODOS"
```

Badge compartido:

```ts
// components/shared/payment-status-badge.tsx
type BadgeStatus = "PAGADO" | "PENDIENTE";
// PAGADO    -> bg-emerald-500/15 text-emerald-700 dark:text-emerald-300
// PENDIENTE -> bg-red-500/15 text-red-700 dark:text-red-300
// usa <Badge variant="outline"> de shadcn como contenedor
```

Convención: las clases de color siguen los design tokens de shadcn/Tailwind (sin hex), igual que el resto del proyecto.

## Implementation plan

1. Instalar el componente `badge` de shadcn: `npx shadcn@latest add badge`. Verificar que aterriza en `components/ui/badge.tsx`. `npm run lint`.
2. Crear `lib/filters/listado-filters.ts` con `PaymentStatusFilter`, `ListadoFilters`, `DEFAULT_PAYMENT_STATUS_FILTER`, `PAYMENT_STATUS_FILTER_OPTIONS`, `parseListadoFilters`, `filtersToSearchParams` y `applyListadoFilters`. Validación tolerante: fechas inválidas → `null`. `npm run lint`.
3. Crear `components/shared/payment-status-badge.tsx`: recibe `status: "PAGADO" | "PENDIENTE"` y devuelve el badge con las clases descritas en data model. `npm run lint`.
4. Crear `components/shared/listings-toolbar.tsx` (cliente): layout flex con `justify-between`; izquierda = `Input` `desde`, `Input` `hasta`, `Select` de estado y botón `Limpiar filtros` (visible solo si hay algún filtro activo); derecha = `children`. Usa `useSearchParams` + `useRouter` + `usePathname` para escribir la URL. `npm run lint`.
5. Crear `components/shared/data-table-pagination.tsx` (cliente): recibe `table` (instancia TanStack) y renderiza selector de tamaño, contador `Mostrando X–Y de Z`, números de página con elipsis y Anterior/Siguiente. Cuando cambia el tamaño, resetea a `pageIndex = 0`. `npm run lint`.
6. Refactor `components/ventas/sales-columns.tsx`: renombrar header `Estado` → `Estado Pago` y reemplazar la celda con `<PaymentStatusBadge status={sale.status} />`. Mismo cambio en `components/compras/purchases-columns.tsx`. `npm run lint`.
7. Refactor `components/ventas/sales-data-table.tsx`:
   - lee filtros con `useSearchParams` → `parseListadoFilters` → `applyListadoFilters`
   - reemplaza el footer de paginación por `<DataTablePagination table={table} />`
   - conserva el `Input` de búsqueda libre en su posición actual (arriba del datatable, debajo de la fila de filtros)
   Mismo refactor en `components/compras/purchases-data-table.tsx`. `npm run lint`.
8. Actualizar `app/ventas/listado/page.tsx`: leer `searchParams` (Promise en Next 16), pasarlos al `SalesDataTable` y envolver el header en `<ListingsToolbar action={<Button onClick={openCreate}>Registrar venta</Button>}>`. Quitar el `Button` actual de la cabecera. Mismo cambio en `app/compras/listado/page.tsx` con "Registrar compra". `npm run build`.
9. Verificación manual:
   - `npm run dev` en `/ventas/listado`: aplicar `desde`/`hasta`, cambiar estado, confirmar que la URL lleva los `searchParams` y la tabla refleja el filtro.
   - Repetir en `/compras/listado`.
   - Cambiar tamaño de página y avanzar de página; copiar la URL y pegarla en otra pestaña: los filtros se conservan (la paginación es client-side y no viaja en la URL).
   - Inspección visual del badge verde/rojo en modo claro y oscuro.
10. Cerrar con `npm run lint` y `npm run build` en verde.

## Acceptance criteria

- [x] `/ventas/listado` y `/compras/listado` muestran una fila superior con los filtros a la izquierda y el botón "Registrar venta" / "Registrar compra" a la derecha.
- [x] Los filtros son: `desde` (date), `hasta` (date) y estado de pago (`Todos` / `Pagado` / `Pendiente`); por defecto todos vacíos / `Todos`.
- [x] Los filtros se persisten en `searchParams`: `?desde=YYYY-MM-DD&hasta=YYYY-MM-DD&estado=PAGADO|PENDIENTE`. Recargar la página conserva los filtros y compartir la URL reproduce el mismo listado.
- [x] El filtro de fecha filtra sobre `issueDate` (Fecha emisión) y es inclusivo en ambos extremos.
- [x] El filtro de estado mapea `Pagado` → `status === "PAGADO"`, `Pendiente` → `status === "PENDIENTE"`, `Todos` no aplica filtro (y se omite de la URL).
- [x] Si `desde` o `hasta` no son fechas válidas, se ignoran sin romper la página (validación tolerante en `parseListadoFilters`).
- [x] Cuando hay al menos un filtro activo, aparece el botón "Limpiar filtros" que resetea los `searchParams` y la paginación a la página 0.
- [x] El input de búsqueda libre "Buscar ventas/compras" sigue funcionando y conserva su posición actual (sobre la tabla, debajo de la fila de filtros).
- [x] La columna "Estado" se renombra a "Estado Pago" en ambas tablas.
- [x] La celda de "Estado Pago" muestra badge verde para `PAGADO` y rojo para `PENDIENTE`, con buen contraste en modo claro y oscuro.
- [x] El badge usa `bg-emerald-500/15` / `bg-red-500/15` con `text-emerald-700` / `text-red-700` en claro y `*-300` en oscuro — sin colores hex hardcodeados.
- [ ] La paginación muestra: contador "Mostrando X–Y de Z", selector de tamaño (10/25/50/100, default 10), botones Anterior/Siguiente y números de página con elipsis cuando hay más de 5 páginas.
- [ ] Cambiar el tamaño de página resetea al índice 0.
- [ ] Cambiar cualquier filtro resetea la paginación al índice 0.
- [x] `npm run lint` y `npm run build` pasan.

## Decisions

- **Sí:** filtros y paginación client-side. Los datos ya están en memoria vía providers (SPEC 07/08). Mover al servidor es otra spec.
- **Sí:** persistir filtros en `searchParams` (URL compartible, back/forward del navegador), patrón idéntico a SPEC 10 en `/pagos/*`.
- **Sí:** filtro de fecha sobre `issueDate` solamente. `dueDate` queda fuera por ahora.
- **Sí:** opción "Todos" como default; no se serializa en la URL cuando está activa.
- **Sí:** componente `PaymentStatusBadge` compartido para evitar divergencia entre ventas y compras.
- **Sí:** `ListingsToolbar` compartido con slot `children` para el botón de acción; las dos páginas solo cambian el label y el `onClick`.
- **Sí:** paginación completa (contador + tamaño + números) en lugar de mantener los dos botones sueltos; el dataset esperado crece.
- **Sí:** Badge de shadcn con clases suaves (`*-500/15` + `*-700`/`*-300`) — sin hex.
- **Sí:** renombrar la columna a "Estado Pago" para reservar "Estado" si en el futuro hay estado de comprobante fiscal (VÁLIDO / ANULADO).
- **No:** eliminar el input de búsqueda libre; sigue siendo útil para texto que no encaja en filtros estructurados.
- **No:** filtros por cliente/proveedor, tipo de comprobante, fecha de vencimiento.
- **No:** paginación server-side.
- **No:** nuevas combinaciones de estado.

## Risks

| Riesgo | Mitigación |
| --- | --- |
| Filtrar y paginar en cliente con miles de filas es lento | Volumen esperado bajo; mover a server-side en otra spec si crece. |
| El usuario edita la URL a mano con valores inválidos | `parseListadoFilters` descarta valores inválidos sin romper la página. |
| Badge rojo/verde falla contraste WCAG en algún modo | Usar las variantes suaves que ya usa shadcn en sus propios badges (`*-500/15` sobre `*-700`/`*-300`); verificar con DevTools. |
| Cambio de filtro no resetea la paginación | Resetear `pageIndex` cuando los filtros cambien, dentro del data-table. |
| "Estado Pago" choca con la convención de SPEC 09 | El header es solo UI; no afecta enums (`comprobante_status`) ni la lógica de SPEC 09. |

## What is **not** in this spec

- Filtros por cliente/proveedor, tipo de comprobante, fecha de vencimiento o rango de totales.
- Paginación o filtrado server-side.
- Guardar filtros favoritos en `localStorage`.
- Nuevos valores para `status`.
- Quitar o reubicar el input de búsqueda libre.
- Cambios al formulario de alta ni a la lógica de pagos de SPEC 09.

Cada uno de esos, si aparece, va en su propia spec.
