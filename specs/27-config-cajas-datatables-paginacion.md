# SPEC 27 — UI de configuración caja/bancos, datatables homogéneos y layout de pagos

> **Estado:** Implementado
> **Depende de:** SPEC 25, SPEC 26
> **Fecha:** 2026-10-08
> **Objetivo:** Rediseñar el menú de configuración de caja y bancos (tabs Cuentas, Métodos de pago y Categorías según el patrón toolbar + datatable + paginación), alinear los listados de ingresos/egresos al layout de tres líneas de ventas y completar la paginación en todos los datatables del proyecto, convirtiendo las tablas planas a datatables paginados.

## Why this spec exists

La configuración de caja/bancos creció por parches: dos botones de registro separados, filtro de tipo como toggles, y las pestañas de Métodos y Categorías son listas hechas a mano con registro inline en lugar del patrón datatable ya consolidado en ventas/compras. Por otra parte, la paginación está incompleta: `clients-data-table.tsx` y `payments-view.tsx` usan un paginador casero Anterior/Siguiente en vez del `DataTablePagination` estándar (SPEC 11), `cash-accounts-data-table.tsx` inicializa paginación pero no renderiza ningún control, y varias tablas planas (historial de cierres, reporte de cuadre, historial de pagos del comprobante, comprobantes pendientes) ni siquiera son datatables. Esta spec unifica todo en el patrón toolbar → datatable + paginación.

## Scope

**In:**

- Tab Cuentas (`CajasBancosListadoView`):
  - Un solo botón de registro ("Registrar cuenta") en lugar de "Registrar caja" + "Registrar banco".
  - En el modal de cuenta, el select de tipo de cuenta inicia en valor "Seleccionar" (sin default `CASH_BOX`); al elegir "Banco" aparece el grupo "Datos bancarios", al elegir "Caja" se ocultan y se limpian los campos bancarios. El botón Guardar queda deshabilitado hasta elegir un tipo.
  - El filtro de tipo pasa de toggles (Todos/Cajas/Bancos) a combobox con las opciones "Todos" / "Caja" / "Banco".
  - El filtro combobox y el botón de registro van fuera y encima del datatable; el buscador (búsqueda global) queda como segunda línea, encima del datatable.
- Tab Métodos de pago: reemplazar la lista de `MetodosPagoCard` por un datatable con estado; registro vía modal con formulario (código + nombre, métodos nuevos siempre activos); filtro por estado "Todos" / "Activo" / "Inactivo"; botón Agregar + filtro fuera y encima del datatable; el datatable mantiene las acciones actuales (editar nombre inline o en el propio modal, activar/desactivar).
- Tab Categorías: ídem — datatable, registro vía modal, filtro por estado "Todos" / "Activa" / "Inactiva", botón + filtro encima del datatable. El modal tiene un select de tres valores con default "Seleccionar": Ingresos / Egresos (reemplaza los toggles de dirección que hoy viven fuera del registro). Las acciones actuales (renombrar inline, activar/desactivar) se conservan.
- Pestaña Configuración general (`GeneralSettingsCard`): NO se toca.
- Paginación homogénea en todos los datatables del proyecto:
  - `clients-data-table.tsx` (clientes): reemplazar el paginador casero Anterior/Siguiente por `DataTablePagination`.
  - `payments-view.tsx` (ingresos/egresos): ídem.
  - `cash-accounts-data-table.tsx` (cuentas de caja): renderizar `DataTablePagination` (hoy solo inicializa paginación).
  - Convertir tablas planas a datatable paginado: historial de cierres en `cuadres-view.tsx`, las tablas del reporte de cuadre (`cuadre-report.tsx`), el historial de pagos del comprobante (`payment-history-section.tsx`) y la tabla de comprobantes pendientes (`VouchersTable` en `payments-view.tsx`).
- Pagos ingresos/egresos (`payments-view.tsx`) al layout de ventas: línea 1 toolbar de filtros + botón Registrar pago; línea 2 campo de búsqueda; línea 3 datatable; línea 4 paginación.
- Regenerar tipos de Supabase NO es necesario: no hay cambios de esquema.

**Out of scope (for future specs):**

- Pestaña "General" de la configuración y cualquier ajuste de `GeneralSettingsCard`.
- Servicios/API de backend para métodos de pago y categorías: se reutilizan `listPaymentMethods`, `createPaymentMethod`, `updatePaymentMethod`, `listCategories`, `createCategory`, `updateCategory` (los métodos nuevos se graban siempre `isActive: true` y el toggle interno queda para activar/desactivar).
- Conciliación que procesa recibos (SPEC 26 out-of-scope vigente).
- Filtrado/orden en servidor o cursor pagination: todo sigue siendo local.
- Edición masiva, import/export o bulk actions en los datatables nuevos.

## Data model

Esta spec **no introduce nuevas estructuras de datos ni cambios de BD**. Reutiliza:

- `CashAccount` (`lib/cuentas/entidades.ts`) y `cashAccountFormSchema` (`lib/schemas/cash-account.ts`), con ajuste de tipo: `type` pasa a opcional en el formulario (`type?: CashAccountType`) con refinement "debes elegir el tipo de cuenta"; el schema persistido no cambia después de elegir un valor válido.
- `PaymentMethodRef` (`components/pagos/types.ts`): `{ id, code, name, isActive }` para la fila del datatable de métodos.
- `CashReceiptCategory` (`components/pagos/types.ts`): `{ id, direction, name, isActive }` para la fila del datatable de categorías.
- Valores de dirección existentes: `PaymentDirection = "INGRESO" | "EGRESO"`.
- `cashAccountsTableFeatures`, `paymentsTableFeatures` y features existentes de TanStack Table.

Convención de patrón para cada listado (repartida en esta spec):

```tsx
{/* fuera y encima del datatable */}
<div className="flex ... justify-between">
  <FiltersRow />      {/* combobox selecciones: tipo/estado etc. */}
  <Button>Registrar…</Button>
</div>
<SearchInput />       {/* línea 2: búsqueda global */}
<DataTable />
<DataTablePagination table={table} />
```

## Implementation plan

> Los pasos del plan están agrupados por fase de la orquestación; los que comparten fase B corren en paralelo como unidades independientes. La numeración refleja el orden temporal.

**Fase A (prerrequisito único):**

1. En `components/clientes/clients-data-table.tsx`, reemplazar el bloque del paginador casero por `DataTablePagination table={table}`. Test manual: npm run dev, listado de clientes pagina 10/25/50/100.
2. En `components/cajas-bancos/cash-accounts-data-table.tsx`, añadir `DataTablePagination` al pie del datatable (mismo estado de paginación ya inicializado).
3. Convertir el historial de cierres de `components/cajas-bancos/cuadres-view.tsx` a datatable: estado con `useTable` + columnas (Período, Periodicidad, Esperado, Conteo, Diferencia, Acciones), paginación inicial 10/25/50/100 en el estado, `DataTablePagination` al pie.
4. Convertir las tablas de `components/cajas-bancos/cuadre-report.tsx` a datatables paginados con el mismo patrón (columnas según encabezados actuales).
5. Convertir `components/comprobantes/payment-history-section.tsx` a datatable paginado.
6. Tests: revisar/actualizar `tests/components/*` afectados por paginaciones nuevas; correr `npm run test -- --run` y `npm run lint`.

**Fase B (paralela; cada unidad es auto-contenida):**

7. `B1 — Tab Cuentas` (solo `CajasBancosListadoView` + archivos cash-account-*):
   - Fusionar "Registrar caja"/"Registrar banco" en un solo botón "Registrar cuenta" que abre el modal con tipo en "Seleccionar" (sin setear el filtro al abrir, para no sesgar el listado).
   - Cambiar los toggles Todos/Cajas/Bancos por un combobox (Select de shadcn con opciones "Todos"/"Caja"/"Banco") fuera y encima del datatable.
   - El buscador queda como segunda línea encima del datatable; el estado del filtro vive en `CajasBancosListadoView` y el datatable recibe solo las cuentas ya filtradas (prop `accounts`).
   - En `cash-account-form.tsx`: el default del tipo pasa a `undefined` con placeholder "Seleccionar"; el refinamiento de zod obliga a elegir; los grupos "Datos bancarios" se muestran solo si `type === "BANK_ACCOUNT"` y al elegir "Caja" se resetean `bankName`, `accountNumber`, `cci` (ya parcialmente implementado); en `handleSave` el botón Guardar de `CashAccountModal` se deshabilita mientras el tipo no esté elegido.
   - Renderizar `DataTablePagination` al pie del datatable de cuentas.
8. `B2 — Tab Métodos de pago` (`metodos-pago-card.tsx` + nuevos `metodos-pago-data-table.tsx`, `metodos-pago-columns.tsx`, `metodos-pago-modal.tsx`):
   - Crear datatable con columnas: Badge Activo/Inactivo, Código, Nombre, Acciones (editar, activar/desactivar y renombrar inline como hoy).
   - Reemplazar los inputs al pie por un botón "Agregar método" fuera y encima del datatable; el registro ocurre en modal con los campos actuales (código + nombre; nuevo registro siempre activo, igual que hoy).
   - Filtro por estado "Todos"/"Activo"/"Inactivo" junto al botón, fuera y encima del datatable.
   - Control de edición por nombre/código: reutilizar la estructura de renombrado inline existente (Check/X) o el propio modal; decisión del implementador, solo un mecanismo.
   - Renderizar `DataTablePagination` al pie.
9. `B3 — Tab Categorías` (ídem con `categorias-*`):
   - Reemplazar toggles de dirección + input al pie por datatable + botón "Agregar categoría" + filtro de estado "Todos"/"Activa"/"Inactiva", fuera y encima del datatable.
   - Modal con select de tres valores `Seleccionar` (default) / `Ingresos` / `Egresos` (map interno a `INGRESO`/`EGRESO`); el Guardar se deshabilita mientras la dirección no esté elegida.
   - El datatable muestra: Badge Activa/Inactiva, badge o etiqueta de tipo (Ingreso/Egreso), Nombre, Acciones idénticas a métodos.
   - Renderizar `DataTablePagination` al pie.
10. `C — Módulo de pagos ingresos/egresos` (tras Fase A; solo `payments-view.tsx` y `payments-listings-toolbar.tsx`):
  - Reordenar al layout de ventas: `PaymentsListingsToolbar` (filtros + "Registrar pago") en línea 1; el `Input` global de búsqueda con su estado (`globalFilter`) sacado del toolbar a la vista, línea 2; datatable línea 3; `DataTablePagination` línea 4 (reemplaza Anterior/Siguiente).
  - Convertir `VouchersTable` (comprobantes pendientes/vencidos) a datatable paginado con columnas Comprobante, Entidad, Emisión, Vencimiento, Saldo.

**Fase Z (integración; orquestador en sesión principal):**

11. `npm run lint` + `npm test` + `npm run build`, corregir lo que rompan.
12. Verificación con navegador (Playwright): recorrer `/cajas-bancos/configuracion` (3 tabs: registro con "Seleccionar", datos bancarios al elegir Banco, registro por modal, filtros combinados con paginación), `/cajas-bancos/cuentas`, `/pagos/ingresos`, `/pagos/egresos` (layout de 3 líneas) y `/clientes` (paginación estándar). Confirmar que se ve el layout de ventas (toolbar/búsqueda/tabla/paginación).
13. Fixes visuales o de interacción si los hay (cap de 2 rondas); según hallazgos, devolver a la unidad responsable si el fix es estructural.

## Acceptance criteria

- [ ] El tab Cuentas muestra UN solo botón "Registrar cuenta" encima del datatable (no hay "Registrar caja" ni "Registrar banco").
- [ ] Abrir el modal de cuenta: el select de tipo se muestra "Seleccionar"; al elegir "Banco" aparece el grupo "Datos bancarios" (Banco, Nro de cuenta, CCI); al elegir "Caja" esos campos no aparecen; Guardar está deshabilitado hasta elegir un tipo.
- [ ] Editar una cuenta existente de tipo banco preserva el tipo preseleccionado y los datos bancarios precargados.
- [ ] En tab Cuentas, el filtro de tipo es un combobox con opciones "Todos", "Caja", "Banco", y sigue filtrando el listado.
- [ ] En tabs Cuentas, Métodos de pago y Categorías: filtro + botón de registro/búsqueda están por fuera y encima del datatable (no dentro), con la búsqueda como segunda línea.
- [ ] El listado de Métodos de pago es un datatable con columnas Badge estado, Código, Nombre y Acciones, y paginación de 10/25/50/100 al pie.
- [ ] "Agregar método" abre un modal con código + nombre; al confirmar el método aparece en el datatable y continúa activo.
- [ ] El filtro de estado de Métodos de pago limpia los inactivos cuando se selecciona "Activo" y viceversa; "Todos" muestra ambos.
- [ ] El listado de Categorías es un datatable con paginación y filtro de estado Activa/Inactiva funcional.
- [ ] "Agregar categoría" abre un modal con nombre y select de dirección con default "Seleccionar"; al elegir Ingresos o Egresos y confirmar, la categoría aparece en el datatable con su tipo y activa.
- [ ] El Guardar del modal de categorías está deshabilitado mientras el select sea "Seleccionar".
- [ ] El listado de ingresos/egresos muestra: línea 1 filtros Desde/Hasta/Estado + botón Registrar pago; línea 2 búsqueda; línea 3 datatable; línea 4 paginación estándar.
- [ ] La tabla de comprobantes pendientes/vencidos de pagos es un datatable paginado.
- [ ] El listado de clientes usa `DataTablePagination` (no Anterior/Siguiente casero).
- [ ] El historial de cierres de caja, el reporte de cuadre y el historial de pagos del comprobante son datatables paginados.
- [ ] Todos los datatables de las pantallas listadas en el plan muestran paginación funcional.
- [ ] `npm run lint`, `npm test` y `npm run build` pasan sin errores.

## Decisions

- **Sí:** un solo botón "Registrar cuenta" con tipo elegible en el modal. El usuario pidió explícitamente fusionar los dos botones y tener "Seleccionar" en el tipo.
- **Sí:** tipo de cuenta opcional en el schema del formulario con default `undefined`, refinamiento de zod y Guardar deshabilitado hasta elegir; comportamiento confirmado por el usuario.
- **Sí:** combobox reemplaza a los toggles Todos/Cajas/Bancos. Confirmado.
- **Sí:** registrar métodos y categorías vía modal con datatable, como pedía el prompt original. Reutiliza la lógica de servicio existente (sin backend nuevo).
- **Sí:** replicar el layout de ventas (toolbar/búsqueda/tabla/paginación) en pagos ingresos/egresos; el usuario señaló que "debería estar como en ventas".
- **Sí:** convertir las tablas planas (cierres, cuadre, historial en comprobante, comprobantes pendientes) a datatables paginados; el usuario pidió que "todas las listas" sean datatables con paginación.
- **No:** tocar backend/RLS/servicios `lib/caja` ni `lib/pagos`: los cambios son solo UI/client-side.
- **No:** pestaña General de configuración: no fue pedida y mantiene el patrón Card previo.
- **No:** filtrado en servidor: los listados son locales y las cantidades son manejables; mantenido el estado de TanStack.

## Orquestación multiagente

| Fase | Depende de | Agente | Modelo | Archivos permitidos | Archivos prohibidos | Salida |
| --- | --- | --- | --- | --- | --- | --- |
| A | — | general (subagente) | `opencode-go/qwen3.7-plus` #high (0.4/1.6) | `components/clientes/clients-data-table.tsx`, `components/cajas-bancos/cuadres-view.tsx`, `components/cajas-bancos/cuadre-report.tsx`, `components/comprobantes/payment-history-section.tsx`, tests afectados | `components/pagos/**`, `components/cajas-bancos/metodos-pago-card.tsx`, `categorias-card.tsx`, `cajas-bancos-listado-view.tsx`, `cash-*` | Clientes/cuentas/cierres/cuadre/historial paginados; lint+test verdes |
| B1 | A | general (subagente) | `opencode-go/glm-5.3` (1.4/4.4) | `components/cajas-bancos/cajas-bancos-listado-view.tsx`, `cash-accounts-data-table.tsx`, `cash-account-form.tsx`, `cash-account-modal.tsx`, `cash-accounts-columns.tsx`, `lib/schemas/cash-account.ts` | resto de `components/cajas-bancos/**`, `components/pagos/**`, `components/clientes/**` | Tab Cuentas: botón único, combobox tipo, modal "Seleccionar" + datos bancarios + paginación |
| B2 | A | general (subagente) | `opencode/claude-haiku-5-5` (0.1/0.5) | `components/cajas-bancos/metodos-pago-card.tsx`, nuevos `metodos-pago-data-table.tsx`/`metodos-pago-columns.tsx`/`metodos-pago-modal.tsx` | `cajas-bancos-listado-view.tsx`, `categorias-card.tsx`, `components/pagos/**` | Tab Métodos: datatable + modal + filtro estado + paginación |
| B3 | A | general (subagente) | `opencode/claude-haiku-5-5` (0.1/0.5) | `components/cajas-bancos/categorias-card.tsx`, nuevos `categorias-data-table.tsx`/`categorias-columns.tsx`/`categorias-modal.tsx` | `cajas-bancos-listado-view.tsx`, `metodos-pago-card.tsx`, `components/pagos/**` | Tab Categorías: datatable + modal con Seleccionar/Ingresos/Egresos + filtro estado + paginación |
| C | A | general (subagente) | `opencode/claude-haiku-5-5` (0.1/0.5) | `components/pagos/payments-view.tsx`, `components/pagos/payments-listings-toolbar.tsx` | `components/cajas-bancos/**`, `components/clientes/**`, `components/comprobantes/**` | Pagos en layout de 3 líneas + paginación estándar + VouchersTable como datatable paginado |
| Z | A,B1,B2,B3,C | orquestador (sesión principal) | `opencode-go/gpt-6-luna` (0.1/0.5) | fixes en cualquier archivo ya existente | ninguna nueva estructura | lint+test+build verdes, navegación Playwright verificada |

### Reglas de convivencia

- Traslape cero: cada archivo editado solo aparece en una unidad; el que necesite dos sets se fusiona con su unidad prerrequisito o con la que ya lo toca.
- Las 3 unidades de B corren en paralelo (máximo simultáneo: 3); B1/B2/B3 cumplen su columna "Salida" tal cual y no tocan archivos fuera de su columna "Archivos permitidos".
- Ninguna unidad hace commit. El commit se hace en rama `spec-27-config-cajas-datatables` después de la Fase Z, desde la sesión principal.
- Prompts de subagentes autocontenidos: incluyen el objetivo de la unidad, los archivos permitidos/prohibidos, el patrón de layout (fragmento Data model), los criterios de aceptación relacionados y su criterio de salida.
- Los subagentes no corren `npm run build` (evita compilar en conflicto simultáneo); solo lint + los tests que tocan su área. El build global lo corre la Fase Z.

## Risks

| Riesgo | Mitigación |
| --- | --- |
| Los toggles de dirección de Categorías hoy filtran el listado; al moverlos al modal, el listado podría perder ese eje de navegación | El datatable de categorías muestra la columna Tipo (Ingreso/Egreso) y agrega el filtro de estado Activa/Inactiva; un filtro por dirección queda como futura mejora si el listado crece |
| La conversión a datatable de reportes impresos (cuadre) podría alterar el layout de impresión | Verificar la vista de impresión en la Fase Z; si el reporte físico se rompe, excluir esa tabla y registrar en Decisions |
| Fase B1 y Fase A tocan componentes vecinos de cajas-bancos (los archivos son distintos pero el dominio no) | Ventana de ejecución: A antes que B; de ignorar la regla, puede haber confusiones en el estado `isLoading`/props del provider; el orquestador valida en Fase Z |
| Cambiar el default del tipo a opcional puede romper otros usos de `CashAccountType` | El tipo de entidad no cambia; solo el form input y el zod refine; chequear los tests de form de cuentas si existen |

## What is **not** in this spec

- Pestaña General de configuración de caja/bancos.
- Cambios a BD, RLS, servicios `lib/caja`/`lib/pagos`, o regeneración de tipos de Supabase.
- Conciliación con procesado de recibos (SPEC 26).
- Filtrado, orden o paginación en servidor.
- Rediseño de modales de detalle (pago, venta) o columnas de datatables existentes salvo lo dicho.
- Estilos/tema nuevos: se usa el patrón shadcn y DataTablePagination ya existentes.
