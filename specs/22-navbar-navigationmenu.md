# SPEC 22 — Barra de navegación superior con NavigationMenu

> **Estado:** Implementado
> **Depende de:** SPEC 04, SPEC 20
> **Fecha:** 2026-10-06
> **Objetivo:** Reemplazar el sidebar lateral por una barra de navegación superior con `NavigationMenu` de shadcn, conservando rutas, grupos desplegables y cierre de sesión.

## Alcance

**Dentro:**

- Instalar `navigation-menu` con `npx shadcn@latest add navigation-menu` (crea `components/ui/navigation-menu.tsx`).
- Nuevo `components/app-navbar.tsx` (cliente): marca `GESTION COMERCIAL` (icono `Building2`), `NavigationMenu` con VENTAS y COMPRAS como enlaces directos, y MAESTRO, PAGOS y CAJA Y BANCOS como `NavigationMenuTrigger` + `NavigationMenuContent` con sus enlaces actuales (mismos `href` de hoy); estado activo por `usePathname`.
- `app/(app)/layout.tsx`: eliminar `SidebarProvider`/`SidebarInset`/`SidebarTrigger`/`AppSidebar`; un solo header integrado con marca + NavigationMenu + `SignOutButton` alineado a la derecha.
- En pantallas angostas la barra hace scroll horizontal (`overflow-x-auto`).
- Quitar los badges de conteo: la navegación deja de consumir `usePagos` (el provider se queda: lo usan otras pantallas).
- Eliminar `components/app-sidebar.tsx` y adaptar el test `tests/components/sidebar-no-warnings.test.tsx` → test del navbar (mismos enlaces, sin warnings).

**Fuera del alcance:**

- Menú hamburguesa con `Sheet` para móvil (otra spec si hace falta).
- Menú de usuario con avatar.
- Badges de conteo en la navegación.
- Cambios de rutas, páginas o datos: solo la navegación.
- Borrar `components/ui/sidebar.tsx` (queda instalado aunque sin uso).

## Modelo de datos

Esta spec **no introduce estructuras de datos nuevas**. Es solo capa de presentación: `components/app-navbar.tsx`, `app/(app)/layout.tsx` y `components/ui/navigation-menu.tsx`.

## Plan de implementación

1. Instalar `navigation-menu` vía shadcn. Verificar que `npm run build` sigue pasando.
2. Crear `components/app-navbar.tsx` con marca + NavigationMenu (VENTAS, COMPRAS, MAESTRO▾, PAGOS▾, CAJA Y BANCOS▾) + `SignOutButton` a la derecha. Prueba manual: navegar a `/cajas-bancos/cuentas` y ver la barra con el item activo.
3. Actualizar `app/(app)/layout.tsx`: reemplazar el bloque de sidebar por el header con `AppNavbar`. Prueba manual: recorrer las rutas.
4. Eliminar `components/app-sidebar.tsx` y adaptar el test de componente al navbar. Ejecutar `npm test`.
5. Verificación visual con Playwright (login `yrra_rojas@hotmail.com`): rutas, dropdowns, viewport angosto (375 px) y logout.

## Criterios de aceptación

- [x] No existe `components/app-sidebar.tsx` y no quedan imports de `ui/sidebar` fuera de `ui/sidebar.tsx`.
- [x] El header muestra: marca, VENTAS, COMPRAS, MAESTRO▾, PAGOS▾, CAJA Y BANCOS▾ y "Cerrar sesión" a la derecha.
- [x] VENTAS y COMPRAS navegan directo; los tres grupos abren dropdown con exactamente los mismos `href` que el sidebar actual.
- [x] El item de la ruta actual se ve con estilo activo (incluidos los subitems dentro del dropdown).
- [x] No aparecen badges de conteo en la navegación.
- [x] En viewport de 375 px la barra hace scroll horizontal sin romper el layout.
- [x] "Cerrar sesión" funciona desde el header.
- [x] `npm run lint`, `npm test` y `npm run build` pasan.
- [x] El test del navbar corre sin warnings de React.

## Decisiones

- **Sí:** barra superior sin sidebar, en un único header integrado (elección del usuario).
- **Sí:** dropdowns por grupo en vez de menú plano (9+ entradas saturarían la barra).
- **No:** badges de conteo — se quitan; desacopla la navegación de `usePagos` y simplifica el componente.
- **Sí:** instalar `navigation-menu` vía CLI de shadcn (decisión confirmada por el usuario; la regla del repo exige preguntar antes de instalar).
- **Sí:** scroll horizontal en móvil; hamburguesa + `Sheet` queda para otra spec.
- **Sí:** renombrar a `AppNavbar` (el nombre refleja la geometría nueva); el test de sidebar se adapta, no se elimina.
- **No:** borrar `ui/sidebar.tsx` — lo gestiona shadcn y borrarlo a mano rompería reinstalaciones futuras.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Los paneles de `NavigationMenu` son absolutos y pueden tapar contenido o desalinearse | Usar el patrón del ejemplo de shadcn (content dentro del item) y probar en las 5 rutas |
| El test `sidebar-no-warnings` deja de aplicar tal cual | Se reemplaza por el equivalente del navbar en el mismo paso, no queda el test roto |
| En móvil el dropdown puede abrirse fuera del ancho visible | Contenedor con `overflow-x-auto` y verificación en 375 px como criterio |

## Lo que **no** está en esta spec

- Hamburguesa móvil con `Sheet`, menú de usuario, badges, cambios de rutas, borrado de `ui/sidebar.tsx`.
