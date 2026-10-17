# SPEC 39 — Notas de crédito/débito y comprobante de retención

> **Status:** Aprobado
> **Depends on:** SPEC 09, SPEC 13, SPEC 36
> **Date:** 2026-10-17
> **Objective:** Registrar y listar notas de crédito y débito (emitidas sobre ventas y recibidas de proveedores) y comprobantes de retención recibidos de clientes, con su efecto en el saldo del comprobante referenciado.

## Why this spec exists

SPEC 36 dejó fuera "NC/ND y `comprobante_referenciado`" a propósito: un comprobante emitido no se edita, se corrige con una nota de crédito/débito. El usuario pidió el módulo el 2026-10-17 con tres entradas de menú ("Notas de crédito", "Notas de débito", "Comprobante de retención") y definió el alcance: NC/ND **emitidas y recibidas**; retenciones **recibidas** (sus clientes son agentes de retención; él no emite retenciones). Hoy no hay forma de registrar estos documentos: el importador OCR de la SPEC 38 (en espera) los rechaza a propósito ("el registro no la soporta") y el saldo del comprobante original no admite ajustes. La skill `facturacion-sunat-mype` aportó la regla: la NC **disminuye** el importe y la ND lo **aumenta**, ambas referencian el comprobante original; el comprobante de retención lo emite el agente que retiene (el cliente) y no cambia el importe de la operación.

## Scope

**In:**

1. Datos: `voucher_type` gana `NOTA_CREDITO`, `NOTA_DEBITO` y `COMPROBANTE_RETENCION`; `comprobante` gana `referenced_comprobante_id` y `motive_code`, con CHECK de consistencia y trigger de integridad (referencia existente, del mismo dueño y tipo, e inmutable).
2. Saldos: la vista `voucher_balance` ajusta el saldo del comprobante referenciado (NC y retención son crédito; ND es débito) y expone `credit_amount`/`debit_amount`; las filas de nota/retención no aparecen en la vista (no son cobrables ni pagables). `refresh_comprobante_status` marca PAGADO cuando pagos + créditos cubren total + débitos, y `validate_allocation` impide que un reparto supere el saldo efectivo.
3. App: registro, edición y listado de NC y ND (emitidas y recibidas) y de comprobantes de retención recibidos, con número validado (serie-correlativo, SPEC 36) y motivo del catálogo SUNAT (NC: 01–07, 09, 10; ND: 01–03) centralizado en un solo módulo.
4. UI: tres rutas (`/notas/credito`, `/notas/debito`, `/retenciones`) con el patrón de listados existente (DataTable + modal), filtro Emitidas/Recibidas, y el grupo "Notas y retenciones" en el navbar.
5. Validaciones: motivo obligatorio en NC/ND; referencia obligatoria en los tres tipos; tope Σ (NC + retenciones) ≤ total del referenciado; unicidad de número por tipo (índice de SPEC 36); los listados de ventas/compras y el selector de pagos excluyen los documentos de ajuste.

**Out of scope (for future specs):**

- CPE electrónico (XML/UBL, firma, CDR) y cualquier envío a SUNAT desde la app.
- Importación OCR de NC/ND/retención (al retomar la SPEC 38 podría extenderse el parser).
- Percepción del IGV, detracción (ya tiene categoría de caja) y flujos de agente de retención.
- Enlace de la retención a un pago específico (aplicación "por pago").
- Reportes por motivo, widgets de dashboard y exportables de notas.
- Baja lógica expuesta en UI para notas.
- Moneda del comprobante (sigue PEN; la retención recibida se registra en soles).

## Data model

- **Migración 1 `spec39_voucher_type_ajustes`** (vía MCP `apply_migration`, copia versionada en `supabase/migrations/`): los valores del enum van en una migración propia — Postgres no permite *usar* un valor recién agregado dentro de la misma transacción en que se agrega:

```sql
alter type public.voucher_type add value if not exists 'NOTA_CREDITO';
alter type public.voucher_type add value if not exists 'NOTA_DEBITO';
alter type public.voucher_type add value if not exists 'COMPROBANTE_RETENCION';
```

- **Migración 2 `spec39_comprobante_ajustes_y_saldos`**:
  - Columnas: `referenced_comprobante_id uuid references public.comprobante(id)` y `motive_code text` (nullable; solo los ajustes las usan).
  - CHECK `comprobante_ajuste_check`: NC/ND exigen referencia y motivo; retención exige referencia y motivo nulo; los tipos base exigen ambas nulas. Los 14 comprobantes existentes (todos `FACTURA`, verificado el 2026-10-17) cumplen sin backfill.
  - Índice parcial `comprobante_referenced_idx` sobre `referenced_comprobante_id` (donde no es nulo).
  - Trigger `comprobante_validate_adjustment` (BEFORE INSERT OR UPDATE): la referencia existe, es del mismo `owner_id` y `voucher_kind`, y es de tipo base (una nota no referencia otra nota); en UPDATE, `referenced_comprobante_id`, `voucher_type` y `voucher_kind` de una nota no cambian.
  - `private.protect_paid_comprobante()`: además de pagos, bloquea cambios de total/número/cliente/fecha cuando existen notas o retenciones que referencian el comprobante.
  - `private.refresh_comprobante_status()`: PAGADO cuando `pagos + créditos ≥ total + débitos` (créditos = NC + retención; débitos = ND; sumando solo filas con `deleted_at is null`).
  - Trigger `comprobante_adjustment_status` (AFTER INSERT OR UPDATE OR DELETE en `comprobante`): recalcula el estado del comprobante referenciado cuando nace, cambia o se da de baja lógica una nota.
  - `private.validate_allocation()`: el tope pasa de `total` a `total + débitos − créditos` del comprobante referenciado.
  - Vista `public.voucher_balance` (reemplazo): filas solo de tipos base (`FACTURA`, `BOLETA`, `NOTA_VENTA`); columnas nuevas `credit_amount` y `debit_amount`; cálculo por comprobante:

```sql
paid_amount   = Σ asignaciones de pagos no anulados            -- igual que hoy
credit_amount = Σ total de NC + retención que lo referencian   -- no dadas de baja
debit_amount  = Σ total de ND que lo referencian               -- no dadas de baja
balance       = c.total - paid_amount - credit_amount + debit_amount
```

  - Las filas de nota/retención se guardan en `comprobante` con `payment_type = 'CONTADO'`, `credit_days`/`due_date` nulos y `status = 'PAGADO'` (no son deuda; su efecto vive en el referenciado).

- **Tipos TS**: regenerar `lib/supabase/types.ts` (`npm run gen:types`; fallback vía MCP `generate_typescript_types`).

- **Convención de importes** (documentada para que el histórico no dependa de la tasa): NC/ND llevan total con IGV y se desglosan con la regla vigente (base = total ÷ 1.18, reutilizando `calculateAmounts`); la retención no tiene desglose de IGV — se guarda `subtotal = total`, `igv = 0` y la UI lo muestra como "monto retenido".

## Implementation plan

1. Migración 1 (valores del enum) + `npm run gen:types` + advisors de seguridad y rendimiento. Ningún valor se usa todavía: el sistema queda intacto.
2. Migración 2 (columnas, CHECK, índice, trigger, funciones y vista) + `gen:types` + advisors. Humo con SQL descartable: insertar una NC de prueba contra una venta, ver el saldo bajar y el estado llegar a PAGADO al cubrir el total; limpiar los datos de prueba.
3. `lib/data/nota-options.ts`: motivos de NC y ND (códigos del catálogo), etiquetas de los tres tipos y relaciones (Emitida/Recibida). Test unitario de opciones.
4. `lib/schemas/voucher.ts` compartido (el patrón serie-correlativo hoy vive privado en `sale.ts`/`purchase.ts`) + `lib/schemas/nota.ts` (motivo requerido solo en NC/ND, referencia requerida, total > 0). Tests unitarios del esquema y ajuste de imports en ventas/compras.
5. `lib/comprobantes/notas.ts`: listar notas/retenciones (con entidad y número del referenciado), listar comprobantes referenciables, crear/editar con validación del tope de créditos y mapeo de errores (23505 duplicado, P0001 del trigger, 23514 del CHECK). Tests unitarios con el patrón de mocks existente.
6. `listSales` y `listPurchases` filtran tipos base (`FACTURA`, `BOLETA`, `NOTA_VENTA`). Tests unitarios actualizados.
7. Componentes compartidos en `components/notas/` (formulario configurable, modal, tabla, columnas) + página `/notas/credito` con filtro Emitidas/Recibidas. Test de componente del formulario (validaciones en español, precarga del saldo y cálculo base/IGV).
8. Página `/notas/debito` reutilizando los componentes (mismo flujo, lado débito).
9. Página `/retenciones` (sin motivo ni desglose de IGV; importe único) y grupo "Notas y retenciones" en `components/app-navbar.tsx` con las tres entradas. Test del navbar actualizado.
10. e2e `tests/e2e/registrar-nota-credito-y-ver-saldo.spec.ts` (seed documentado, `test.skip` sin credenciales, patrón SPEC 37/38) y validación final `npm run lint` + `npm test` + `npm run build`.

## Acceptance criteria

- [ ] Registrar una NC emitida sobre una venta baja el saldo de esa venta en el listado de ventas y en la cartera del cliente.
- [ ] Registrar una NC recibida de un proveedor baja el saldo de esa compra.
- [ ] Registrar una ND emitida sube el saldo de la venta referenciada; una ND recibida sube el de la compra.
- [ ] Registrar el comprobante de retención de un cliente baja el saldo de la venta referenciada por el monto retenido.
- [ ] Con créditos + pagos que cubren el total, el comprobante referenciado pasa a PAGADO solo; si se anula un pago, vuelve a PENDIENTE.
- [ ] Un pago cuyo reparto, sumado a los créditos, supere el total del comprobante es rechazado con mensaje claro (el picker lo anticipa con el saldo efectivo).
- [ ] Editar importe, número, cliente o fecha de un comprobante con notas o retenciones queda bloqueado en pantalla y rechazado por la BD si se fuerza.
- [ ] La suma de NC y retenciones sobre un comprobante no puede superar su total: el intento se rechaza con mensaje en español (también al editar una nota existente).
- [ ] Una nota sin referencia (o sin motivo, en NC/ND) se rechaza en el formulario con mensaje en español.
- [ ] Referenciar un comprobante inexistente, de otro tipo o de otro dueño se rechaza.
- [ ] Un número de nota que no calza el formato serie-correlativo, o que duplica otro del mismo tipo, se rechaza con mensaje claro.
- [ ] Las notas y retenciones no aparecen en los listados de ventas/compras ni en el selector de pagos; aparecen en su propio listado con filtro Emitidas/Recibidas.
- [ ] El navbar muestra "Notas y retenciones" con las tres entradas y cada página lista sus documentos.
- [ ] Una retención se registra sin motivo y sin desglose de IGV (importe único).
- [ ] `npm run lint`, `npm test` y `npm run build` pasan.
- [ ] El e2e `registrar-nota-credito-y-ver-saldo` pasa contra el dev server con el seed documentado.

## Decisions

- **Sí:** una sola tabla `comprobante` con tipos nuevos — reutiliza numeración/unicidad (SPEC 36), RLS y la vista de saldos. **No:** tabla aparte para notas/retenciones (duplicaba toda la mecánica y los listados).
- **Sí:** NC y retención son **crédito** (bajan saldo) y ND es **débito** (lo sube), integrados en `voucher_balance`. **No:** filas de nota visibles en la vista — contaminarían cartera, listados y selector de pagos.
- **Sí:** `motive_code` guarda el código (01–07/09/10 NC; 01–03 ND) y las etiquetas viven en `lib/data/nota-options.ts`. **No:** guardar la etiqueta — el código es lo estable.
- **Sí:** retención **recibida** referenciada a la venta (aplicación por operación); el ingreso neto se registra aparte como pago normal. **Pendiente del contador:** si la aplicación es por pago, se añade el enlace al pago en una spec futura sin migrar datos.
- **Sí:** retención con `subtotal = total` e `igv = 0`. **No:** hacer nullable `subtotal`/`igv` — rompería los tipos y consumidores de ventas/compras por un caso que la UI muestra como importe único.
- **Sí:** tope Σ (NC + retención) ≤ total del referenciado validado en la app. **No:** trigger con lock en el MVP — riesgo concurrente aceptado y anotado en Risks.
- **Sí:** edición de notas permitida (corregir digitación) sin poder cambiar referencia/tipo; sin UI de baja. **No:** eliminar notas desde la UI — el borrado físico ya está bloqueado (RLS, SPEC 36).
- **Sí:** `validate_allocation` y `refresh_comprobante_status` incluyen créditos/débitos. **No:** dejarlos solo con pagos — permitiría sobrepagos y estados PAGADO tempranos.
- **Sí:** menú padre "Notas y retenciones" (decisión del usuario). **No:** "Notas de crédito/débito" — la retención no es una nota.
- **No:** CPE electrónico, OCR de notas, percepción/detracción, reportes por motivo, multi-moneda. Cada uno, si llega, va en su propia spec.

## Risks

| Risk | Mitigation |
| --- | --- |
| Motivos y tasa de retención cambian por resolución SUNAT | Catálogos centralizados en `lib/data/nota-options.ts`; la app no calcula la tasa (se registra el monto retenido real). Confirmar el catálogo vigente con el contador. |
| La vista `voucher_balance` cambia y tiene varios consumidores (ventas, compras, cartera, selector de pagos, detalle de pagos) | Reemplazo compatible (mismas columnas + dos nuevas); tests unitarios de los mappers existentes + humo post-migración verificando listados y cartera. |
| Tope de créditos concurrente (dos NC a la vez superan el tope) | Aceptado en el MVP (un dueño, uso de escritorio); mejora futura: trigger con `for update` sobre el referenciado. |
| Retención "por pago" en lugar de "por operación" | Modelo referenciado a la venta; si el contador confirma por pago, se enlaza al pago en una spec futura sin migración de datos. |
| El e2e necesita dev server + credenciales + seed | Documentado en AGENTS.md y en el comentario inicial del spec, como SPEC 37/38. |
| `gen:types` sin CLI de Supabase | Fallback: tipos vía MCP `generate_typescript_types` (como SPEC 32/34/36). |

## What is **not** in this spec

- CPE electrónico (XML/UBL, firma, CDR) y envío a SUNAT.
- OCR/importación automática de notas y retenciones.
- Percepción del IGV, detracción y flujos de agente de retención.
- Enlace retención → pago y aplicación por pago.
- Reportes por motivo, widgets de dashboard y exportables.
- Baja lógica expuesta en UI y anulación masiva.

Cada uno de esos, si llega, va en su propia spec.
