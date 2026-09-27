# SPEC 01 — Registro y listado de clientes

> **Status:** Implementado
> **Depends on:** —
> **Date:** 2026-09-27
> **Objective:** Construir en `/clientes/listado` un data table de clientes en memoria con un modal que permite registrar y editar clientes validando sus datos.

## Scope

**In:**

- Inicializar shadcn/ui (`npx shadcn@latest init`) y agregar los componentes necesarios.
- Ruta `app/clientes/listado/page.tsx` con un data table (TanStack Table) de clientes en memoria.
- Botón **Registrar cliente** que abre un `Dialog` con el formulario de alta.
- Formulario con `react-hook-form` + `zod` y campos: tipo de documento, número de documento, nombre/empresa, dirección, teléfono, contacto, correo de facturación, correo de gestión.
- Selector de tipo de documento (`RUC`, `DNI`, `CARNET_EXTRANJERIA`, `SIN_DOCUMENTO` por defecto) que ajusta label, placeholder y validación del número.
- Búsqueda global, orden por columna y paginación en el data table.
- Acciones por fila: **Editar** (reutiliza el modal) y **Eliminar** (con `AlertDialog` de confirmación).
- Toast de éxito al guardar.

**Out of scope (for future specs):**

- Backend, API, base de datos, autenticación.
- Persistencia entre recargas (`localStorage`, cookies, servidor).
- Exportación, acciones masivas, selección de filas, filtros por columna.
- Vista de detalle del cliente.
- Navegación/sidebar y enlace desde el home.

## Data model

```ts
// components/clientes/types.ts
export type DocumentType =
  | "RUC"
  | "DNI"
  | "CARNET_EXTRANJERIA"
  | "SIN_DOCUMENTO";

export interface Client {
  id: string;               // crypto.randomUUID()
  documentType: DocumentType;
  documentNumber: string;   // vacío si documentType === "SIN_DOCUMENTO"
  name: string;             // NOMBRE/EMPRESA
  address: string;          // DIRECCION
  phone: string;            // TELEFONO
  contactName: string;      // CONTACTO
  billingEmail: string;     // CORREO FACTURACION
  managementEmail: string;  // CORREO GESTION
}
```

```ts
// lib/schemas/client.ts (zod)
// name: requerido (min 1)
// billingEmail: requerido, formato email
// managementEmail / phone / address / contactName: opcionales; emails validados si hay valor
// documentNumber:
//   RUC   → /^\d{11}$/
//   DNI   → /^\d{8}$/
//   CARNET_EXTRANJERIA → /^[A-Za-z0-9]{9,12}$/
//   SIN_DOCUMENTO → sin validación (campo deshabilitado)
```

Convenciones:

- Nombres de campos y tipos en inglés, `camelCase` (según AGENTS.md).
- Textos de la UI en español.
- Opciones del select centralizadas en `lib/data/document-types.ts` con `{ value, label, placeholder }`.

## Implementation plan

1. `npx shadcn@latest init` → crea `components.json`, `lib/utils.ts` y ajusta `app/globals.css`. Verificar `npm run build`.
2. Agregar componentes shadcn: `button`, `input`, `label`, `select`, `textarea`, `form`, `dialog`, `table`, `dropdown-menu`, `alert-dialog`, `sonner`; instalar `@tanstack/react-table`.
3. Crear `components/clientes/types.ts`, `lib/data/document-types.ts` y `lib/schemas/client.ts`. Verificar: `npm run lint`.
4. Montar `<Toaster />` de sonner en `app/layout.tsx`.
5. Crear `app/clientes/listado/page.tsx` (client component) con estado en memoria: `clients`, `modalOpen`, `editingClient`.
6. Crear `components/clientes/client-form.tsx` (react-hook-form + zodResolver) con el campo de documento condicional.
7. Crear `components/clientes/client-modal.tsx`: `Dialog` con modos alta/edición y título dinámico.
8. Crear `components/clientes/clients-columns.tsx` y `components/clientes/clients-data-table.tsx` (búsqueda global, orden, paginación, estado vacío).
9. Conectar acciones: Editar (abre modal precargado, guardar actualiza) y Eliminar (`AlertDialog` → remueve del estado).
10. Verificar `npm run lint` y `npm run build`.

## Acceptance criteria

- [x] `/clientes/listado` renderiza sin errores en consola.
- [x] El botón **Registrar cliente** abre el modal con el formulario vacío.
- [x] El tipo de documento inicia en **Sin documento** y el número queda deshabilitado sin validación.
- [x] Al elegir RUC/DNI/Carnet cambian label, placeholder y validación (11 dígitos / 8 dígitos / 9-12 alfanumérico).
- [x] Enviar sin nombre o con correo de facturación inválido muestra errores y no envía.
- [x] Un envío válido muestra toast de éxito, cierra el modal, limpia el formulario y agrega una fila.
- [x] El data table muestra las columnas Nombre, Documento, Teléfono y Correo de facturación.
- [x] La búsqueda global filtra filas, el orden por columna funciona y la paginación funciona.
- [x] **Editar** abre el modal con título "Editar cliente" y campos precargados; guardar actualiza la fila sin duplicarla.
- [x] **Eliminar** abre un `AlertDialog`; confirmar quita la fila y cancelar la conserva.
- [x] Sin clientes se muestra "No hay clientes registrados".
- [x] Recargar la página borra las filas (solo memoria).
- [x] `npm run lint` y `npm run build` pasan.

## Decisions

- **Sí:** formulario dentro de un `Dialog` lanzado desde `/clientes/listado` (pedido del usuario).
- **Sí:** `react-hook-form` + `zod` con el componente `Form` de shadcn.
- **Sí:** validación de formato por tipo e input deshabilitado en `SIN_DOCUMENTO`.
- **Sí:** obligatorios = nombre y correo de facturación; el resto opcional.
- **Sí:** Data Table con TanStack (búsqueda global + orden + paginación), patrón oficial de shadcn.
- **Sí:** un solo modal reutilizado para alta y edición.
- **Sí:** `AlertDialog` de confirmación para eliminar.
- **Sí:** estado en memoria (`useState` en la página), sin persistencia.
- **No:** `/clientes/nuevo` como página (descartado tras el cambio de diseño).
- **No:** backend/localStorage (queda para otra spec).
- **No:** enlace desde el home (acceso por URL directa).

## Risks

| Riesgo | Mitigación |
| --- | --- |
| `shadcn init` reescribe `app/globals.css` (Tailwind v4 CSS-first) | Revisar el diff y conservar `@import "tailwindcss"` + `@theme inline`. |
| Incompatibilidad de `@tanstack/react-table` con React 19 | Usar el bloque actual de shadcn y validar con `npm run build`. |
| Validación condicional del documento en zod | Implementar con `superRefine`; probar cada tipo manualmente. |
| Requisitos de Next 16 (client components, `PageProps`) | `"use client"` en página y formulario; revisar las guías en `node_modules/next/dist/docs/` antes de codificar. |

## What is **not** in this spec

- Backend, API, base de datos o autenticación.
- Persistencia entre recargas.
- Exportar, filtros por columna, selección de filas ni acciones masivas.
- Vista de detalle del cliente.
- Navegación adicional o enlace desde el home.

Cada uno de esos, si aparece, va en su propia spec.
