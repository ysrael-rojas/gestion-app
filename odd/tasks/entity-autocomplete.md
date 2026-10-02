# Tarea: autocomplete en campos de cliente y proveedor

**Feature:** `entity-autocomplete`
**Estado:** en curso
**Rama:** actual (no se creará rama a menos que el usuario lo pida; los cambios son work-unit commits)
**Módulos afectados:** Compras, Ventas, Pagos (Ingresos y Egresos)

## Objetivo

Reemplazar el `Select` actual por un **autocomplete** en el campo de cliente
(módulo Ventas, Pagos Ingresos) y de proveedor (módulo Compras, Pagos Egresos).
El usuario debe poder escribir para filtrar, ver el documento sublacente del
cliente y limpiar la selección.

Mantener intacta la API del formulario (React Hook Form + Zod): mismo `name`
(`entityId` o `supplierId`), mismo valor (id de la entidad), misma validación
de obligatoriedad.

## Decisiones confirmadas con el usuario

1. **Información secundaria:** nombre principal; debajo, el documento
   (`RUC 12345678`, `DNI 12345678`, etc.).
2. **Creación inline:** NO. La creación de clientes y proveedores se mantiene
   en el módulo Clientes dedicado. El autocomplete solo permite seleccionar.

## Decisiones técnicas (sin preguntas adicionales, documentadas aquí)

1. **Filtrado:** local en cliente. La cantidad de clientes/proveedores esperada
   es pequeña; el costo de filtrar en el navegador es despreciable frente a
   ir a Supabase por cada tecla.
3. **Origenación de los datos:** se conserva la carga actual. `useClientes()`
   para clientes (módulo Ventas); `listSuppliers()` para proveedores
   (módulos Compras y Pagos Egresos); para pagos Ingresos se usa
   `useClientes()`. Sin nuevo código de fetching.
4. **Wrapper de UI:** se crea `components/ui/combobox.tsx` estilo shadcn
   4.x base-nova (mismo patrón que `components/ui/select.tsx`),
   reenvoltando `@base-ui/react/combobox` (ya instalado v1.8.0). No se
   agregan dependencias nuevas.
5. **API del Combobox:** `Combobox.Root` con `items` array de
   `{ value, label, secondaryLabel? }`. `Combobox.Filter` por defecto: match
   case-insensitive contra `label`. Render custom por item con label arriba
   y `secondaryLabel` abajo en `text-muted-foreground`.
6. **Compatibilidad con React Hook Form:** se consume vía `Controller` con
   `value={field.value || null}` y `onValueChange={(v) => field.onChange(v ?? "")}`,
   idéntico al patrón actual de `Select`.
7. **i18n:** los textos visibles al usuario quedan en español
   ("Sin coincidencias", placeholder, label, etc.), según `AGENTS.md`.

## Cambios

### A. Nuevo wrapper de UI

Archivo nuevo: `components/ui/combobox.tsx`

- Exporta `Combobox`, `ComboboxInput`, `ComboboxContent`, `ComboboxList`,
  `ComboboxItem`, `ComboboxEmpty`, `ComboboxPopup`, `ComboboxPortal`,
  `ComboboxPositioner` envueltos sobre `@base-ui/react/combobox`.
- Estilos consistentes con `select.tsx` (mismo `data-slot`, mismo uso de
  `cn` y `lucide-react`).

### B. Nuevo componente reutilizable

Archivo nuevo: `components/shared/entity-autocomplete.tsx`

- Props: `items: { value: string; label: string; secondaryLabel?: string }[]`,
  `value: string | null`, `onValueChange: (value: string) => void`,
  `placeholder`, `disabled`, `aria-invalid`, `id`, `name`.
- Si `items` está vacío: muestra el Combobox deshabilitado con placeholder
  "No hay clientes/proveedores".
- Si `items.length > 0` y nada seleccionado: usa el `placeholder` provisto.
- `secondaryLabel` se muestra bajo el `label` en cada `ComboboxItem`.

### C. Reemplazo en formularios

- `components/ventas/sale-form.tsx` — campo `entityId` (Cliente):
  reemplazar `<Select>` por `<EntityAutocomplete>`.
- `components/compras/purchase-form.tsx` — campo `supplierId` (Proveedor):
  reemplazar `<Select>` por `<EntityAutocomplete>`.
- `components/pagos/payment-form.tsx` — campo `entityId` (Entidad
  Cliente/Proveedor según `direction`): reemplazar `<Select>` por
  `<EntityAutocomplete>`.

No se tocan otros `Select` del proyecto (voucherType, paymentType, status,
method, receiptWidth). Quedan fuera del alcance de esta tarea.

### D. Tests

Archivo nuevo: `tests/components/entity-autocomplete.test.tsx`

- Renderiza con items, abre, escribe, ve filtrado, selecciona, propaga
  `onValueChange`.
- Renderiza con lista vacía: muestra el placeholder de "no hay".
- Renderiza deshabilitado: no abre.
- Limpia con `value=""`.

## Riesgos y mitigaciones

| Riesgo | Mitigación |
| --- | --- |
| `@base-ui/react/combobox` con React 19 + RHF en modo controlado tiene sutiles diferencias con `Select` | El componente aísla el detalle; los formularios consumen `value`/`onValueChange` con el mismo contrato que `Select`. |
| El filtro por defecto de `@base-ui` puede no buscar en `secondaryLabel` | El filtro opera sobre `label`. El usuario ve el documento en el item, así que el match por nombre basta para la búsqueda primaria; el documento queda como referencia visual. Documentado en la sección de decisiones. |
| Tests existentes pueden fallar si importaban el `Select` directamente desde los formularios | Los tests apuntan a `tests/components/PaymentHistorySection`, `PaymentStatusBadge` y `DataTablePagination`, no a los formularios. Verificado en `package.json`. |
| El CLI `shadcn add combobox` puede fallar contra el registry oficial | Se evita esa dependencia: el wrapper se crea a mano siguiendo el patrón de `select.tsx`. Sin conexión de red en runtime. |

## Evidencia de cierre

- `npm run lint` pasa.
- `npm test` pasa: 13 archivos, 100 tests OK. Incluye el nuevo
  `tests/components/entity-autocomplete.test.tsx` con 9 casos
  (placeholder, loading, lista vacía, click → `onValueChange`,
  `secondaryLabel` por item, omisión `SIN_DOCUMENTO`, filtrado por
  escritura, helper `toEntityAutocompleteItem`).
- `npm run build` pasa.
- Los 3 formularios (`sale-form.tsx`, `purchase-form.tsx`, `payment-form.tsx`)
  ahora usan `<EntityAutocomplete>` en el campo cliente/proveedor; los
  otros `Select` del proyecto (`voucherType`, `paymentType`, `status`,
  `method`, `receiptWidth`) quedan sin tocar.
- Sin commits creados. El usuario debe pedirlos explícitamente (regla del
  repo: "Nunca hacer commit sin que el usuario lo pida explícitamente").