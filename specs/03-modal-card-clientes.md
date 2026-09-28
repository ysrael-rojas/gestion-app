# SPEC 03 — Estructura Card en los modales y grupos de clientes

> **Status:** Aprobado
> **Depends on:** SPEC 02
> **Date:** 2026-09-28
> **Objective:** Reestructurar los modales de alta/edición y de detalle de `/clientes/listado` con el componente `Card` (header, contenido y footer) y agrupar sus campos en dos `Card` de grupo, eliminando las líneas separadoras.

## Scope

**In:**

- Instalar el componente `card` de shadcn (`npx shadcn@latest add card`).
- Reestructurar `components/clientes/client-modal.tsx`: dentro del `DialogContent`, usar `Card`, `CardHeader` (título y descripción), `CardContent` (formulario) y `CardFooter` (acciones) en lugar de `DialogHeader`/`DialogFooter`.
- En `components/clientes/client-form.tsx`, reemplazar el `Separator` de `FormGroup` por un `Card` por grupo; los títulos siguen siendo **Datos del documento** y **Datos de contacto**.
- Reestructurar `components/clientes/client-detail-modal.tsx` con el mismo `Card` (header/contenido/footer) y agrupar sus 8 campos en dos `Card`, con el botón **Cerrar** en el `CardFooter`.
- Reparto del detalle: bloque documento → Tipo, Número, Nombre/Empresa, Dirección; bloque contacto → Teléfono, Contacto, Correo de facturación, Correo de gestión.
- Mantener intactos campos, validación, textos de UI, lógica en memoria y acciones de la tabla.

**Out of scope (for future specs):**

- Backend, API, base de datos, autenticación y persistencia entre recargas.
- Cambios en validación, esquema zod o lógica de alta/edición/eliminación.
- Menú contextual (`ContextMenu`) y sus acciones; se descartó tras aclarar que no aporta bloque visual.
- Cambios en el data table, búsqueda global, orden, paginación o acciones de fila.
- Otras rutas y navegación.

## Data model

Esta spec no introduce estructuras de datos nuevas ni estado nuevo. Reutiliza `Client` y `ClientFormValues` de SPEC 01 y el estado ya existente en `app/clientes/listado/page.tsx`.

## Implementation plan

1. `npx shadcn@latest add card` → crear `components/ui/card.tsx`. Verificar `npm run build`.
2. En `components/clientes/client-form.tsx`, cambiar `FormGroup` para que renderice `Card` (`CardHeader` + `CardTitle` + `CardContent`) con su grid interno, eliminando el `Separator`. Verificar: `npm run lint`.
3. En `components/clientes/client-modal.tsx`, reemplazar `DialogHeader`/`DialogFooter` por `Card`/`CardHeader`/`CardContent`/`CardFooter` dentro del `DialogContent`, conservando `DialogTitle`/`DialogDescription` y el submit externo `form={CLIENT_FORM_ID}`.
4. En `components/clientes/client-detail-modal.tsx`, aplicar la misma estructura `Card` y agrupar los campos en los dos `Card` definidos, con **Cerrar** en el `CardFooter`.
5. Verificar `npm run lint` y `npm run build`.

## Acceptance criteria

- [ ] Existe `components/ui/card.tsx` y `npm run build` pasa.
- [ ] El modal de alta/edición muestra su contenido dentro de un `Card` con header (título y descripción) y footer (acciones).
- [ ] El footer del modal contiene "Cancelar" y "Registrar"/"Guardar cambios".
- [ ] El formulario muestra dos bloques `Card` con los títulos "Datos del documento" y "Datos de contacto".
- [ ] Ya no se muestra la línea separadora entre grupos.
- [ ] Tipo y Número de documento siguen en la misma fila; Nombre/Empresa y Dirección en fila propia.
- [ ] Teléfono y Contacto en la misma fila; cada correo en fila propia.
- [ ] El modal de detalle usa el mismo `Card` con header/footer y un botón "Cerrar".
- [ ] El detalle agrupa sus campos en los dos `Card` con el reparto indicado.
- [ ] Registrar, editar, cancelar, ver y eliminar funcionan sin regresiones.
- [ ] Búsqueda global, orden y paginación siguen funcionando.
- [ ] `npm run lint` y `npm run build` pasan.

## Decisions

- **Sí:** `Card` dentro del `DialogContent` en ambos modales, con header, contenido y footer.
- **Sí:** un `Card` por grupo en el formulario, quitando el `Separator`.
- **Sí:** agrupar también el detalle en los mismos dos `Card`.
- **Sí:** instalar únicamente el componente `card`.
- **No:** `ContextMenu` real; no dibuja contenedor visible y se descartó al aclararlo.
- **No:** cambios de lógica, validación o datos; solo UI.
- **No:** tocar el data table ni sus acciones.

## Risks

| Riesgo | Mitigación |
| --- | --- |
| Anidar `Card` dentro de `Card` duplica bordes/sombras | Usar variantes sin borde/sombra en los `Card` de grupo o ajustar clases. |
| `DialogContent` ya trae `p-4` y `gap` y el `Card` añade padding | Ajustar `className` de `DialogContent`/`Card` para evitar doble espaciado. |
| base-ui requiere `DialogTitle`/`DialogDescription` por accesibilidad | Mantenerlos dentro del `CardHeader`. |
| La API de `Card` de shadcn en esta versión difiere de lo esperado | Revisar `components/ui/card.tsx` tras instalarlo. |

## What is **not** in this spec

- Backend, API, base de datos o autenticación.
- Persistencia entre recargas.
- Cambios en validación, esquema zod o lógica de negocio.
- Menú contextual y sus acciones.
- Cambios en el data table, búsqueda, orden, paginación o acciones de fila.

Cada uno de esos, si aparece, va en su propia spec.
