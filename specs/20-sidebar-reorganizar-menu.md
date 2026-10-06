# SPEC 20 — Reorganizar el menú lateral: CAJA Y BANCOS a primer nivel

> **Status:** Implementado
> **Depends on:** SPEC 04, SPEC 19
> **Date:** 2026-10-06
> **Objective:** Mover CAJA Y BANCOS al primer nivel del sidebar y reordenar los grupos a VENTAS, COMPRAS, MAESTRO, PAGOS, CAJA Y BANCOS.

## Why this spec exists

SPEC 19 agregó CAJA Y BANCOS como un submenú **anidado dentro de MAESTRO** (segundo nivel), cuando conceptualmente es una sección hermana de VENTAS/COMPRAS/MAESTRO/PAGOS. La anidación además obliga a usar `SidebarMenuSubButton` (un `<a>`) como trigger de un `Collapsible`, lo que dispara el warning de accesibilidad de Base UI: `A component that acts as a button expected a native <button> ... nativeButton`. Mover el grupo a primer nivel corrige la jerarquía visual y elimina la causa del warning.

## Scope

**In:**

- `components/app-sidebar.tsx`:
  - Extraer el `Collapsible` de CAJA Y BANCOS de dentro de MAESTRO y convertirlo en grupo de primer nivel, con la misma forma que MAESTRO/PAGOS: `Collapsible render={<SidebarMenuItem />}`, `CollapsibleTrigger render={<SidebarMenuButton tooltip="CAJA Y BANCOS" />}` (icono `Landmark`, `ChevronRight`), `CollapsibleContent` + `SidebarMenuSub`.
  - Reordenar los ítems del `SidebarMenu` a: VENTAS, COMPRAS, MAESTRO, PAGOS, CAJA Y BANCOS.
  - MAESTRO conserva su `Collapsible` con el único sub-item Clientes/Proveedores (`/clientes/listado`).
  - CAJA Y BANCOS conserva sus tres accesos con las rutas ya existentes: Detalle de Cuentas (`/cajas-bancos/cuentas`), Cuadres de Caja (`/cajas-bancos/cuadres`), Configuración (`/cajas-bancos/configuracion`).
  - Aplicar `nativeButton={false}` en los `CollapsibleTrigger` de primer nivel que renderizan un componente en lugar de un `<button>` nativo, eliminando el warning de Base UI en consola.
- `tests/components/sidebar-no-warnings.test.tsx` (nuevo): renderiza `AppSidebar` y afirma que no hay errores de consola con `nativeButton` / `expected a native <button>`.

**Out of scope (for future specs):**

- Rediseño visual del sidebar (colores, spacing, iconografía nueva).
- Badges o contadores en CAJA Y BANCOS (PAGOS ya los tiene vía `usePagos`).
- Permisos/roles que oculten ítems del menú.
- Cambios en `components/ui/sidebar.tsx` o `components/ui/collapsible.tsx` (se resuelve en el call site, no en el wrapper de shadcn).
- Rutas o páginas nuevas para `/cajas-bancos/*`.

## Data model

Esta spec no introduce estructuras de datos nuevas. Reutiliza el objeto local `menu` de `components/app-sidebar.tsx`, los enlaces existentes y el provider `usePagos` (solo para PAGOS).

## Implementation plan

1. En `components/app-sidebar.tsx`, extraer el `Collapsible` de CAJA Y BANCOS de dentro de MAESTRO y recrearlo como grupo de primer nivel con `SidebarMenuButton` + icono `Landmark` + `tooltip="CAJA Y BANCOS"`. Manual: el grupo aparece al mismo nivel que los demás y despliega sus tres sub-items.
2. Reordenar los bloques del `SidebarMenu` a VENTAS, COMPRAS, MAESTRO, PAGOS, CAJA Y BANCOS. Manual: el orden vertical coincide con el pedido.
3. Aplicar `nativeButton={false}` en los `CollapsibleTrigger` que renderizan componentes (`SidebarMenuButton`), de modo que la consola no muestre el warning de Base UI. Manual: recargar el layout y revisar la consola.
4. Crear `tests/components/sidebar-no-warnings.test.tsx` siguiendo el patrón de `tests/components/combobox-no-warnings.test.tsx`.
5. Cerrar con `npm run lint`, `npm test` y `npm run build` (los define la sección de criterios de aceptación).

## Acceptance criteria

- [x] El menú muestra, de arriba hacia abajo: VENTAS, COMPRAS, MAESTRO, PAGOS, CAJA Y BANCOS.
- [x] CAJA Y BANCOS es un grupo colapsable de primer nivel, al mismo nivel que MAESTRO y PAGOS (ya no está anidado dentro de MAESTRO).
- [x] CAJA Y BANCOS despliega Detalle de Cuentas (`/cajas-bancos/cuentas`), Cuadres de Caja (`/cajas-bancos/cuadres`) y Configuración (`/cajas-bancos/configuracion`).
- [x] MAESTRO sigue mostrando Clientes/Proveedores (`/clientes/listado`).
- [x] PAGOS sigue mostrando INGRESOS y EGRESOS con sus badges.
- [x] La consola del layout autenticado no emite el warning de Base UI sobre `nativeButton`.
- [x] `npm run lint`, `npm test` y `npm run build` pasan sin errores nuevos.

## Decisions

- **Sí:** mantener MAESTRO como `Collapsible` aunque le quede un solo sub-item. Da consistencia con PAGOS/CAJA Y BANCOS y espacio para futuros maestros.
- **Sí:** incluir el fix de `nativeButton` en esta spec. La reorganización ya elimina el peor caso (el trigger `<a>`); el fix explícito mata el warning restante y sigue la convención ya usada en `sales-columns`, `sale-detail-modal`, `purchases-columns` y `purchase-detail-modal`.
- **Sí:** CAJA Y BANCOS arranca `defaultOpen`, igual que MAESTRO y PAGOS.
- **No:** aplanar MAESTRO a un enlace directo a `/clientes/listado`. Menos clics hoy, pero rompe el patrón si llegan más maestros.
- **No:** resolver el warning en `components/ui/collapsible.tsx` de forma global. Afectaría a todos los consumidores por un problema puntual.
- **No:** badges en CAJA Y BANCOS. No hay una fuente de conteo definida.

## Risks

| Risk | Mitigation |
| ---- | ---------- |
| El warning `nativeButton` persiste en los triggers que renderizan `SidebarMenuButton` (es un componente, no un `<button>` literal). | Verificar la consola con Playwright tras el cambio; si persiste, `nativeButton={false}` en esos triggers (paso 3). |
| Duplicar el bloque de CAJA Y BANCOS al extraerlo, dejando dos versiones. | Mantener un único bloque: mover, no copiar; revisar el diff antes de cerrar. |
| Los tests de componente del sidebar dependen del provider `usePagos` y del contexto de sidebar. | Envolver el render del test con los providers mínimos (`PagosProvider`, `SidebarProvider`) o mockear `usePagos`. |

## What is **not** in this spec

- Badges o contadores en CAJA Y BANCOS.
- Rediseño visual del sidebar.
- Rutas o páginas nuevas.
- Refactor de `components/ui/sidebar.tsx` / `components/ui/collapsible.tsx`.

Cada uno de esos, si llega, va en su propia spec.
