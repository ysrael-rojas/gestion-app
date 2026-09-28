# SPEC 04 — Sidebar de navegación global

> **Status:** Aprobado
> **Depends on:** SPEC 01
> **Date:** 2026-09-28
> **Objective:** Añadir un sidebar de navegación global con el título GESTION COMERCIAL y el ítem colapsable MAESTRO → Clientes/Proveedores que enlaza a `/clientes/listado`.

## Scope

**In:**

- Instalar el componente `sidebar` de shadcn: `npx shadcn@latest add sidebar` (arrastra las dependencias que necesite el registro, p. ej. `sheet`, `skeleton` y el hook `use-mobile`).
- Crear `components/app-sidebar.tsx`: `Sidebar` con `collapsible="icon"`, `SidebarHeader` (ícono de lucide + texto **GESTION COMERCIAL**), `SidebarContent` → `SidebarGroup` (**MAESTRO**) → `Collapsible` con `SidebarMenuButton` + chevron y `SidebarMenuSub` con el ítem **Clientes/Proveedores**.
- Enlazar **Clientes/Proveedores** a `/clientes/listado` con `next/link` (`SidebarMenuSubButton asChild`).
- Resaltar el ítem como activo cuando la ruta actual es `/clientes/listado`, con `usePathname`.
- Modificar `app/layout.tsx`: envolver el contenido con `SidebarProvider` y `SidebarInset`, renderizar `<AppSidebar />` y un header del contenido con `SidebarTrigger`.
- Comportamiento responsive: colapso a íconos en desktop y off-canvas (Sheet) en móvil.
- Atajo de teclado Ctrl/Cmd+B (por defecto de shadcn) para colapsar/expandir.

**Out of scope (for future specs):**

- Otros grupos o ítems de menú (VENTAS, ALMACÉN, etc.).
- Rediseño, redirección o eliminación del home `/`; se conserva su contenido.
- Rutas nuevas distintas de las ya existentes.
- Backend, API, base de datos, autenticación y persistencia del estado del sidebar.
- Cambios en la lógica, validación o UI de `/clientes/listado` (SPEC 01–03).

## Data model

Esta spec no introduce estructuras de datos persistidas. El estado del sidebar (abierto/colapsado, submenú expandido) lo gestiona internamente `SidebarProvider` y `Collapsible`. La ruta activa se deriva de `usePathname()`.

La configuración del menú vive como una constante local en `components/app-sidebar.tsx`:

```ts
// components/app-sidebar.tsx
const menu = {
  group: "MAESTRO",
  items: [{ label: "Clientes/Proveedores", href: "/clientes/listado" }],
};
```

## Implementation plan

1. `npx shadcn@latest add sidebar` → crear `components/ui/sidebar.tsx` (y las dependencias que agregue). Revisar el diff y verificar `npm run build`.
2. Crear `components/app-sidebar.tsx` (`"use client"`): `Sidebar` con `collapsible="icon"`, `SidebarHeader` con ícono + **GESTION COMERCIAL**, y el grupo **MAESTRO** colapsable con el subítem **Clientes/Proveedores**. Verificar: `npm run lint`.
3. Añadir el enlace `Link href="/clientes/listado"` y el estado activo con `usePathname`.
4. Modificar `app/layout.tsx`: envolver `{children}` con `SidebarProvider`, renderizar `<AppSidebar />`, `SidebarInset` con el header (`SidebarTrigger`) y mantener `<Toaster />`.
5. Verificar `npm run lint` y `npm run build`.

## Acceptance criteria

- [ ] Existe `components/ui/sidebar.tsx` y `npm run build` pasa.
- [ ] Todas las rutas, incluido `/` y `/clientes/listado`, muestran el sidebar en desktop.
- [ ] La cabecera del sidebar muestra un ícono y el texto "GESTION COMERCIAL".
- [ ] Existe el ítem "MAESTRO" con chevron que expande y colapsa el submenú.
- [ ] El submenú muestra el ítem "Clientes/Proveedores".
- [ ] Clic en "Clientes/Proveedores" navega a `/clientes/listado` con `Link` de Next (sin recarga completa).
- [ ] Estando en `/clientes/listado`, el ítem aparece como activo.
- [ ] `SidebarTrigger` colapsa y expande el sidebar; en colapsado se ven los íconos.
- [ ] El atajo Ctrl/Cmd+B colapsa y expande el sidebar.
- [ ] En viewport móvil el sidebar es off-canvas (Sheet) y se abre desde el trigger.
- [ ] El home `/` conserva su contenido original.
- [ ] La tabla, modales, búsqueda y toasts de `/clientes/listado` siguen funcionando sin regresiones.
- [ ] `npm run lint` y `npm run build` pasan.

## Decisions

- **Sí:** componente `sidebar` oficial de shadcn (`collapsible="icon"` + Sheet en móvil), por ser el patrón del repo.
- **Sí:** montarlo en `app/layout.tsx`, de modo que aplique a toda la app incluido el home.
- **Sí:** **MAESTRO** como padre colapsable con chevron (no etiqueta de grupo).
- **Sí:** un único ítem **Clientes/Proveedores** → `/clientes/listado`.
- **Sí:** cabecera con ícono de lucide + texto "GESTION COMERCIAL".
- **Sí:** header del contenido con `SidebarTrigger` y atajo Ctrl/Cmd+B.
- **Sí:** instalar `sidebar` y las dependencias que arrastre el registro.
- **Sí:** marcar el ítem activo según `usePathname`.
- **No:** otros grupos/ítems de ejemplo.
- **No:** rediseñar, redirigir ni eliminar el home.
- **No:** backend, autenticación ni persistencia del estado del sidebar.
- **No:** tocar la lógica de `/clientes/listado`.

## Risks

| Riesgo | Mitigación |
| --- | --- |
| El bloque `sidebar` arrastra `sheet`, `skeleton` y un hook `use-mobile`; puede diferir del estilo base-nova (base-ui) | Revisar el diff tras instalarlo y contrastar con la doc del sidebar antes de codificar. |
| `app/layout.tsx` es server component y el sidebar es cliente | Importar los componentes cliente y marcar `AppSidebar` con `"use client"`; mantener el layout como server. |
| El home está centrado a pantalla completa y `SidebarInset` cambia el ancho | Verificar que siga viéndose bien sin modificar su contenido. |
| En colapsado (`icon`) el submenú y sus tooltips pueden comportarse distinto | Probar el submenú expandido/colapsado y ajustar según la doc de shadcn. |
| Ctrl/Cmd+B puede chocar con atajos del navegador | Es el atajo por defecto de shadcn; documentarlo y aceptarlo. |
| La API de `sidebar` en esta versión de shadcn/Next 16 difiere de lo esperado | Consultar Context7 y `node_modules/next/dist/docs/` antes de codificar. |

## What is **not** in this spec

- Otros grupos o ítems de menú.
- Rediseño, redirección o eliminación del home.
- Rutas nuevas.
- Backend, API, base de datos o autenticación.
- Persistencia del estado del sidebar.
- Cambios en la lógica de `/clientes/listado`.

Cada uno de esos, si aparece, va en su propia spec.
