# SPEC 44 — Series de comprobantes configurables y reordenado del formulario de ventas

> **Status:** Implementado
> **Depends on:** SPEC 07, SPEC 36, SPEC 41
> **Date:** 2026-10-26
> **Objective:** Crear una página `/configuracion` para administrar series de numeración por tipo de comprobante (con una serie por defecto cada una) desde la cual el formulario de ventas sugiere el número que toca registrar, y reordenar el formulario de comprobantes en dos filas con campos requeridos señalizados y la dirección del cliente visible.

## Why this spec exists

El usuario consumió 3 sistemas de facturación externos, cada uno con sus propias series. Hoy la numeración en la app es 100 % manual (SPEC 36: unicidad en DB + regex, sin secuencia automática), así que el sistema no puede ayudar a llevar el control de qué número toca en cada serie. Además, el formulario de registro (`voucher-form.tsx`, SPEC 41) apila sus 3 cards en grids uniformes de 2 columnas, el select de tipo esconde el ítem "Selecciona un tipo" tras la selección sin ninguna señal de campo requerido, y elegir un cliente no muestra su dirección.

## Scope

**In:**

1. **Tabla `voucher_series`** en Supabase (una serie = código + correlativo actual + flag de default por tipo de comprobante), con RLS por owner e índice único parcial que garantiza un solo default por tipo.
2. **Nueva página `/configuracion`** en el navbar (grupo propio, ítem "Configuración"): sección "Series de comprobantes" con tabla (tipo, código, correlativo actual, por defecto) + alta/edición en modal + baja lógica, siguiendo el patrón `client-form`/`client-modal` y `DataTablePagination` existentes.
3. **Sugerencia de numeración en `/ventas/nuevo`**: al elegir un tipo con serie por defecto, el campo "Nro comprobante" se prefila con `CÓDIGO-CORRELATIVO` (correlativo = `last_number + 1`, pad a 6 dígitos). El valor es editable.
4. **Avance automático del correlativo**: al guardar una venta (crear o editar) cuyo número pertenece a una serie registrada del mismo tipo, `last_number` sube al correlativo guardado (solo si es mayor).
5. **Prevención sin serie** (solo ventas): los tipos sin serie por defecto aparecen deshabilitados en el select con hint "Configura una serie para {tipo} en Configuración → Series"; si ningún tipo tiene serie, banner arriba del formulario con link directo.
6. **Select de tipo**: el ítem "Selecciona un tipo" permanece siempre visible en la lista (valor nulo que limpia la selección) y al enviar vacío el trigger se pinta en rojo con error "Selecciona un tipo de comprobante".
7. **Badge "Requerido"** con borde en tono rojo suave junto a los labels de campos requeridos: tipo, nro comprobante, cliente, total, condición (días de crédito solo cuando condición = Crédito).
8. **Cliente**: al seleccionar, su dirección aparece debajo del campo en solo lectura (o "Sin dirección registrada"), tomada de `entidad.address`. Sin cambios de esquema.
9. **Reordenado del formulario** (ventas y compras, mismo componente): fila 1 = "Datos del comprobante" (`lg:col-span-3`) + "Condición de pago" (`lg:col-span-1`); fila 2 = "Montos" (`lg:col-span-4`) con Total/Subtotal/IGV en una fila de 3.
10. **Tests**: unitarios de lib de series y schemas, de componente de `voucher-form` (badges de requerido, placeholder, dirección, sugerencia, tipos deshabilitados) y de la vista de configuración.

**Out of scope (for future specs):**

- Sugerencia o avance de correlativo en compras, notas (NC/ND) y retenciones: siguen con numeración manual.
- Sugerencia en `/ventas/[id]/editar`: el número ya existe; se conserva tal cual.
- Snapshot de la dirección en `comprobante` (solo se muestra; el registro vive en `entidad`).
- Renumeración de recibos (`odd/tasks/cambio-formato-recibos.md`).
- Autoregistro de series nuevas al detectar un prefijo desconocido.
- Series por punto de venta / envío CPE a SUNAT.

## Data model

```sql
create table voucher_series (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  voucher_type voucher_type not null,              -- mismo enum que comprobante (6 valores)
  code text not null check (code ~ '^[A-Za-z0-9]{1,4}$'),  -- "F001", "B002", "NV01"
  last_number integer not null default 0 check (last_number >= 0),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index voucher_series_owner_type_code_idx
  on voucher_series (owner_id, voucher_type, code) where deleted_at is null;
create unique index voucher_series_default_per_type_idx
  on voucher_series (owner_id, voucher_type) where is_default and deleted_at is null;
create index voucher_series_owner_idx on voucher_series (owner_id) where deleted_at is null;
```

RLS igual patrón que `comprobante`: policies `for select/insert/update/delete using (auth.uid() = owner_id)`.

```ts
// Uso en la app
interface VoucherSeries {
  id: string;
  voucherType: VoucherType; // FACTURA | BOLETA | NOTA_VENTA | NOTA_CREDITO | NOTA_DEBITO | COMPROBANTE_RETENCION
  code: string;             // "F001"
  lastNumber: number;       // 0 = sin correlativos usados; se muestra "000125"
  isDefault: boolean;
  deletedAt: string | null;
}

// Sugerencia (lib/comprobantes/series.ts)
suggestVoucherNumber(series) === `${code}-${String(lastNumber + 1).padStart(6, "0")}`
// advanceSeriesNumber(voucherType, voucherNumber): parsea "F001-000130" → si existe serie
// (owner, voucherType, "F001") y 130 > last_number → last_number = 130.
```

**Siembra de series con histórico**: el correlativo nace en 0 (decisión del usuario). Si la serie real del sistema externo va por `F001-000125`, se registra esa venta escribiendo el número real a mano una vez y el avance automático deja `last_number = 125`; a partir de ahí la sugerencia es la correcta.

## Implementation plan

1. Migración `create voucher_series` con `apply_migration` + `npm run gen:types` + revisión de advisors (security/performance). Manual: advisors sin alertas nuevas.
2. `lib/comprobantes/series.ts`: `listSeries()`, `createSeries`, `updateSeries`, `softDeleteSeries`, `setDefaultSeries` (quita default de las demás del tipo y pone la elegida), `advanceSeriesNumber`, `suggestVoucherNumber`, `mapError` (23505 → "Ya existe una serie con ese código para ese tipo.").
3. `lib/schemas/serie.ts` (zod): `voucherType` (6 valores), `code` (regex 1–4 alfanuméricos, mensaje "Usa 1 a 4 caracteres alfanuméricos, por ejemplo F001"), `lastNumber` int ≥ 0 + tests unit.
4. Navbar: grupo "Configuración" con ítem a `/configuracion`; `app/(app)/configuracion/page.tsx` (server shell) + `components/configuracion/configuracion-view.tsx` (pills, "Series" primera) + `series-view.tsx` (tabla + skeleton + vacío) + `serie-modal.tsx` (alta/edición con check "Usar como serie por defecto para este tipo") + baja lógica con confirmación.
5. `voucher-form.tsx` reordenado: grid exterior `grid-cols-1 gap-4 lg:grid-cols-4`; datos `lg:col-span-3` (grid interno `sm:grid-cols-2`, cliente a full con dirección debajo), condición `lg:col-span-1` (apilada), montos `lg:col-span-4` (grid interno `sm:grid-cols-3`: Total, Subtotal, IGV).
6. Mismo archivo: badge "Requerido" junto a los labels requeridos; ítem placeholder con valor nulo siempre visible; `aria-invalid` + `FieldError` rojo al enviar sin tipo; dirección readonly del cliente.
7. `use-voucher-series.ts` (patrón `useVoucher`): `useWatch(voucherType)` → serie default → `setValue("voucherNumber", sugerencia)` solo si el campo estaba vacío o contenía una sugerencia anterior; ítems deshabilitados sin default (VENTA); banner si ningún tipo tiene default; el auto-set de tipo por cliente (RUC→FACTURA) solo aplica si el tipo destino está habilitado.
8. Avance: en `voucher-form-view.tsx`, tras guardar exitoso (VENTA, create o update) → `advanceSeriesNumber` + refresh de series; el toast de éxito se mantiene.
9. Tests de componente (badges de requerido, placeholder visible, dirección, sugerencia por tipo, ítems deshabilitados) y verificación final: `npm run lint` + `npm test` + `npm run build`.

## Acceptance criteria

- [x] `/configuracion` es accesible desde el navbar y lista las series del owner con tipo, código, correlativo actual y default. Verificado en navegador: grupo "Configuración" → "Series de comprobantes"; el alta de B999/F999 apareció en la tabla con su badge.
- [x] Puedo registrar series para cualquiera de los 6 tipos con código de 1–4 caracteres alfanuméricos y correlativo inicial 0; la validación rechaza códigos inválidos y duplicados del mismo tipo. Cubierto por `serie.test.ts` (schema y `mapError` 23505) y verificado en navegador.
- [x] Solo una serie por tipo queda marcada "por defecto"; el índice único parcial lo garantiza y la UI lo refleja al instante. Verificado en navegador (badge "Predeterminada") y por `voucher_series_default_per_type_idx`.
- [x] La lista del select de tipo siempre incluye "Selecciona un tipo", haya o no selección. Verificado en navegador tras elegir Factura/Boleta y en `voucher-form.test.tsx`.
- [x] Los campos requeridos muestran un badge con borde "Requerido" en tono rojo suave (tipo, nro, cliente, total, condición; días de crédito solo con Crédito) y al enviar vacío el select muestra trigger rojo + "Selecciona un tipo de comprobante". Badge verificado en navegador (5 en el formulario, 2 en el modal de series) y por tests de componente; el error rojo cubierto por test (`aria-invalid="true"`).
- [x] Al elegir cliente aparece su dirección en solo lectura (o "Sin dirección registrada"). Verificado en navegador con cliente RUC (`#entityAddress` readonly) y en test de componente.
- [x] En `/ventas/nuevo`, elegir un tipo con serie default prefila nro comprobante con `CÓDIGO-(last+1)` pad 6, editable; cambiar de tipo recalcula la sugerencia. Verificado en navegador: F999-000001 con cliente RUC y B999-000001 al cambiar a Boleta.
- [x] El tipo sin serie default aparece deshabilitado con hint hacia Configuración; sin ninguna serie, el formulario muestra banner con link en lugar de fallar al enviar. Verificado en navegador y en test de componente.
- [x] Guardar una venta `F001-000130` deja `last_number = 130` (solo si 130 > actual); números con prefijo no registrado no tocan series. Cubierto por `series.test.ts` y verificado contra la DB con una venta real F999-000001: la serie quedó en `last_number = 1`; los datos de prueba se eliminaron después.
- [x] Editar una venta conserva su número sin sugerencia y guarda normalmente. Cubierto por test de componente.
- [x] El formulario de compras tiene el mismo reordenado, sin sugerencias ni bloqueos. Verificado por el grid compartido y test de que compras no sugiere numeración.
- [x] Un owner no ve ni edita series de otro (RLS); advisors sin alertas nuevas. Policies con `(select auth.uid())`; `get_advisors` no reporta hallazgos de `voucher_series`.
- [x] `npm run lint`, `npm test` y `npm run build` pasan. 479 tests, build con la ruta `/configuracion` incluida.

## Decisions

- **Sí:** una sola spec (series + formulario) — la sugerencia no existe sin el módulo y el pedido las enlaza. **No:** partir en dos.
- **Sí:** página `/configuracion` nueva en el navbar. **No:** tab dentro de `/cajas-bancos/configuracion` (mezcla dominios de caja y comprobantes).
- **Sí:** correlativo inicial 0 + avance automático al guardar — permite "sembrar" la serie real escribiendo el número actual a mano una vez. **No:** correlativo editable en el formulario de configuración (elección explícita del usuario).
- **Sí:** bloqueo preventivo en el select (ítems deshabilitados + hint + banner). **No:** error recién al enviar (elección explícita del usuario).
- **Sí:** sugerencia solo en `/ventas/nuevo`. **No:** notas/retenciones/compras ("solo para las ventas", pedido explícito).
- **Sí:** dirección mostrada desde `entidad.address`. **No:** columna `entity_address` en `comprobante` (cambiaría esquema sin necesidad hoy).
- **Sí:** reordenado aplica también a compras — mismo componente `voucher-form`, consistencia.
- **Sí:** badge con borde "Requerido" (rojo suave) + error rojo al fallar. Reemplazó al asterisco inicial por pedido explícito del usuario del 2026-10-26.
- **Sí:** avance client-side tras el save. Es una app de usuario único (MYPE) y la unicidad de `comprobante` ya está en DB (SPEC 36): si dos tabs sugieren el mismo número, el 23505 lo atrapa con mensaje claro. **No:** RPC transaccional como `create_payment_with_allocations` (overkill para una serie).
- **Sí:** el badge va en una fila flex junto al `Label`, fuera de él. Mantiene intacto el nombre accesible de los campos (`getByLabelText` sigue funcionando). **No:** asterisco como pseudo-elemento.
- **Sí:** `lib/supabase/types.ts` actualizado a mano con el bloque de `voucher_series` (mismo formato generado). **No:** `npm run gen:types`, porque el CLI de Supabase no está instalado en este entorno; el script conservó el archivo anterior como estaba previsto. Al instalar el CLI, `npm run gen:types` debe dejar el archivo idéntico.

## Risks

| Riesgo | Mitigación |
| --- | --- |
| Dos tabs abiertas sugieren el mismo correlativo | La unicidad `(owner, voucher_kind, voucher_number)` de SPEC 36 rechaza el duplicado con mensaje claro; el reintento ya ve el `last_number` actualizado. |
| Tipos en uso sin serie configurada bloquean el registro de ventas | Banner con link directo a `/configuracion` (decisión del usuario: prevenir, no fallar al enviar). |
| `gen:types` falla (requiere `supabase link`) | El script conserva el `types.ts` anterior y sale con código 1; la migración queda aplicada y el gen se reintenta. |

## What is **not** in this spec

- Sugerencia de numeración en compras, notas y retenciones.
- Snapshot de dirección en el comprobante.
- Renumeración de recibos de pago.
- Autoregistro de series ante prefijos desconocidos.
- Series por punto de venta / integración CPE SUNAT.

Cada una de esas, si llega, va en su propia spec.
