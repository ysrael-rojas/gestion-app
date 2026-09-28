# SPEC 02 — Rediseño de UI del modal y listado de clientes

> **Status:** Aprobado
> **Depends on:** SPEC 01
> **Date:** 2026-09-28
> **Objective:** Reorganizar la interfaz del modal y del listado de `/clientes/listado` con campos agrupados, footer de acciones y botones Ver/Editar/Eliminar con íconos.

## Scope

**In:**

- Rediseño del formulario del modal en dos grupos con título y separador visible: **Datos del documento** y **Datos de contacto**.
- Filas a dos columnas: Tipo de documento + Número de documento | Teléfono + Contacto. A una columna: Nombre/Empresa, Dirección, Correo de facturación y Correo de gestión.
- Ampliar el modal a `sm:max-w-2xl`.
- `DialogFooter` con botones **Cancelar** y **Registrar**/**Guardar cambios**, juntos, alineados a la derecha y sin ocupar todo el ancho.
- Nuevo modal de detalle de solo lectura (`Ver`) con todos los campos y botón **Cerrar**.
- Reemplazar el `DropdownMenu` de acciones por tres botones de ícono en horizontal (Ver, Editar, Eliminar) con tooltips.
- Añadir el componente `tooltip` de shadcn.

**Out of scope (for future specs):**

- Backend, API, base de datos, autenticación y persistencia entre recargas.
- Cambios en validación, esquema zod o lógica en memoria de alta/edición/eliminación.
- Página de detalle `/clientes/[id]`, edición inline y filtros por columna.

## Data model

Esta spec no introduce estructuras de datos nuevas. Reutiliza `Client` y `ClientFormValues` de SPEC 01. El único estado nuevo es efímero en `app/clientes/listado/page.tsx`: `viewingClient: Client | null` para abrir/cerrar el modal de detalle.

## Implementation plan

1. `npx shadcn@latest add tooltip` → crea `components/ui/tooltip.tsx`. Verificar `npm run build`.
2. Crear `components/clientes/client-detail-modal.tsx`: `Dialog` de solo lectura con todos los campos y un botón **Cerrar** en el `DialogFooter`. Verificar: `npm run lint`.
3. Reestructurar `components/clientes/client-form.tsx`: dos grupos con título ("Datos del documento", "Datos de contacto") y separador/borde, `grid` `grid-cols-1 sm:grid-cols-2` para las filas de dos campos; quitar el botón submit interno y asignar `id="client-form"` al `<form>`.
4. Ajustar `components/clientes/client-modal.tsx`: `sm:max-w-2xl` y `DialogFooter` con **Cancelar** (variant `outline`) y **Registrar**/**Guardar cambios** (`type="submit"` + `form="client-form"`), alineados a la derecha.
5. Reescribir la columna de acciones en `components/clientes/clients-columns.tsx`: tres `Button` `variant="ghost" size="icon-sm"` (`Eye`, `Pencil`, `Trash2`) dentro de un `div` flex horizontal, cada uno envuelto en `Tooltip`; añadir `onView` a las acciones.
6. Actualizar `components/clientes/clients-data-table.tsx` para aceptar y propagar `onView`.
7. Actualizar `app/clientes/listado/page.tsx`: estado `viewingClient`, handler `openView`, `onView` hacia la tabla y render de `ClientDetailModal`.
8. Verificar `npm run lint` y `npm run build`.

## Acceptance criteria

- [ ] El modal de alta muestra el header "Registrar cliente" y un footer visible.
- [ ] En el footer, "Registrar" y "Cancelar" aparecen juntos, a la derecha y sin ocupar todo el ancho.
- [ ] En alta el botón primario dice "Registrar"; en edición dice "Guardar cambios".
- [ ] Tipo de documento y Número de documento están en la misma fila.
- [ ] Nombre/Empresa está en su propia fila y Dirección en su propia fila.
- [ ] El grupo "Datos del documento" se ve separado del grupo "Datos de contacto".
- [ ] Teléfono y Contacto están en la misma fila.
- [ ] Correo de facturación y Correo de gestión ocupan cada uno su propia fila.
- [ ] El modal usa `sm:max-w-2xl`.
- [ ] Guardar desde el footer registra (alta) o actualiza (edición) igual que antes.
- [ ] Cancelar cierra el modal sin guardar ni añadir filas.
- [ ] El listado muestra tres botones de ícono en horizontal: Ver, Editar, Eliminar.
- [ ] Cada botón muestra su tooltip.
- [ ] Ver abre un modal de solo lectura con todos los campos y un botón "Cerrar".
- [ ] Editar abre el modal precargado y Eliminar abre el `AlertDialog`, sin regresiones.
- [ ] Búsqueda global, orden y paginación siguen funcionando.
- [ ] `npm run lint` y `npm run build` pasan.

## Decisions

- **Sí:** el botón Ver abre un modal de detalle de solo lectura (elegido por el usuario).
- **Sí:** labels dinámicos "Registrar"/"Guardar cambios" según modo.
- **Sí:** grupos con título visible y separador.
- **Sí:** modal ampliado a `sm:max-w-2xl`.
- **Sí:** tres botones de ícono ghost con tooltip reemplazan el `DropdownMenu`.
- **Sí:** submit del footer vía atributo `form="client-form"`, porque los botones quedan fuera del `<form>`.
- **Sí:** solo UI; no cambia la lógica en memoria ni la validación de SPEC 01.
- **No:** página de detalle `/clientes/[id]`; el detalle es un modal.
- **No:** backend/persistencia (sigue fuera de alcance, como en SPEC 01).

## Risks

| Riesgo | Mitigación |
| --- | --- |
| El submit externo al `<form>` no dispara si el `id` no coincide | Usar una constante compartida `CLIENT_FORM_ID` entre formulario y footer. |
| API de `DialogFooter`/shadcn en Next 16 difiere de lo esperado | Revisar `components/ui/dialog.tsx` antes de codificar. |
| Las dos columnas rompen el layout en móvil | Usar `grid-cols-1 sm:grid-cols-2`. |
| Añadir `tooltip` requiere dependencia nueva | Confirmar e instalar con `npx shadcn@latest add tooltip`. |

## What is **not** in this spec

- Backend, API, base de datos o autenticación.
- Persistencia entre recargas.
- Página de detalle propia, edición inline, filtros por columna.
- Cambios en la validación o en el esquema zod.

Cada uno de esos, si aparece, va en su propia spec.
