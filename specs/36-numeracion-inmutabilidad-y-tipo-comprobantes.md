# SPEC 36 — Numeración, inmutabilidad y regla de tipo en comprobantes

> **Status:** Aprobado
> **Depends on:** SPEC 07, SPEC 08, SPEC 13
> **Date:** 2026-10-15
> **Objective:** Endurecer los comprobantes de ventas y compras en sus tres zonas críticas fiscales: numeración manual con formato validado y unicidad en la BD, edición bloqueada cuando el comprobante ya tiene pagos, y tipo de comprobante sugerido según el documento del cliente.

## Why this spec exists

Los tres riesgos salieron de la revisión de los módulos de compras y ventas con la skill `facturacion-sunat-mype` (exploración con el agente explore, 2026-10-15): el número de comprobante es texto libre sin unicidad (dos `F001-000001` se aceptan), "Editar" está siempre habilitado aunque el comprobante ya esté cobrado (el saldo puede quedar roto), y el tipo se elige a mano sin vínculo con el documento del cliente (se puede emitir FACTURA a un cliente con DNI o sin documento). Los pagos y la caja ya están endurecidos (SPEC 27, 30, 33, 35); el comprobante quedó pendiente.

## Scope

**In:**

1. Formato del número de comprobante validado en la app: serie + correlativo (ej. `F001-000001`), en ventas y compras.
2. Unicidad del número en la BD: índice único parcial por dueño y tipo de comprobante (VENTA/COMPRA), entre comprobantes vivos.
3. Edición bloqueada de `total`, `voucher_number`, `entity_id` e `issue_date` cuando el comprobante tiene pagos no anulados: en pantalla y con trigger en la BD.
4. En ventas, el tipo de comprobante se precarga según el documento del cliente: RUC → FACTURA; DNI o SIN_DOCUMENTO → BOLETA; FACTURA queda bloqueada si el cliente no tiene RUC.
5. En compras, el tipo se sugiere (FACTURA si el proveedor tiene RUC) pero queda libre: se registra el comprobante que entregó el proveedor.
6. Se elimina la política RLS `comprobante_delete`, que hoy permite borrar físicamente un comprobante; la baja sigue siendo lógica (`deleted_at`).

**Out of scope (for future specs):**

- Notas de crédito/débito (NC/ND) y campo `comprobante_referenciado`.
- Condición tributaria por operación (exonerado/inafecto/exportación) y moneda del comprobante.
- Crédito fiscal en compras (marcar si el IGV es recuperable).
- Umbral de boleta que obliga nombre + DNI del comprador.
- Dígito verificador del RUC (hoy solo se valida longitud).
- Unificar el código duplicado ventas/compras (riesgo aceptado en SPEC 08).
- CPE electrónico (XML, firma, CDR).

## Data model

- **`comprobante`** (índice nuevo): `UNIQUE (owner_id, voucher_kind, voucher_number) WHERE deleted_at IS NULL`. El mismo número entre una VENTA y una COMPRA es legítimo: el número de la factura del proveedor es suyo, no nuestro.
- **Trigger `protect_paid_comprobante()`** (función + BEFORE UPDATE en `comprobante`): si la suma de asignaciones de pagos no anulados es > 0 y cambia `total`, `voucher_number`, `entity_id` o `issue_date`, lanza excepción con mensaje claro (patrón de endurecimiento de SPEC 27/30). La regla de "pagado" replica la vista `voucher_balance`: `sum(amount)` de las asignaciones cuyo pago no está `ANULADO`.
- **RLS de `comprobante`:** se elimina la política `comprobante_delete`. Quitar una política no rompe las demás: `comprobante_select`, `comprobante_insert` y `comprobante_update` se mantienen.
- Sin tablas nuevas y sin cambios de enum. El formato del número se valida solo en la app (zod): un CHECK en la BD rompería históricos.

## Implementation plan

1. Migración (con `apply_migration`): índice único parcial + trigger `protect_paid_comprobante` + eliminación de la política RLS `comprobante_delete`; regenerar tipos; revisar advisors de seguridad y rendimiento.
2. `lib/schemas/sale.ts` y `lib/schemas/purchase.ts`: `voucherNumber` con regex de serie-correlativo (`^[A-Za-z0-9]{1,4}-\d{1,8}$`) y mensajes en español.
3. `lib/comprobantes/comprobantes.ts` y `compras.ts`: mapear la violación de unicidad (23505) y la excepción del trigger a mensajes claros en los toasts.
4. `sale-form.tsx` y `purchase-form.tsx`: precarga del tipo según el documento de la entidad; en ventas, FACTURA deshabilitada si el cliente no tiene RUC.
5. Guard de edición en la UI: con `paidAmount > 0`, deshabilitar total, número, cliente y fecha en los formularios de editar (ventas y compras).
6. Tests unitarios (regex y regla de tipo) y de componente (formularios) + `npm run lint` + `npm run build`.

## Acceptance criteria

- [ ] Una venta o compra con número que no calza el formato serie-correlativo (ej. `factura uno`) es rechazada con mensaje en español.
- [ ] Registrar dos comprobantes del mismo tipo (VENTA/COMPRA) con el mismo número falla: el segundo recibe un mensaje claro de duplicado.
- [ ] El mismo número sí se acepta entre una VENTA y una COMPRA.
- [ ] Editar total, número, cliente o fecha de un comprobante con pagos asignados queda bloqueado en pantalla y es rechazado por la BD si se fuerza.
- [ ] Editar un comprobante sin pagos sigue permitido.
- [ ] Al elegir un cliente con RUC, el tipo precarga FACTURA; con DNI o SIN_DOCUMENTO, precarga BOLETA.
- [ ] FACTURA no es seleccionable cuando el cliente no tiene RUC (opción deshabilitada y validación al enviar).
- [ ] En compras el tipo queda libre: se registra el comprobante que entregó el proveedor.
- [ ] Los comprobantes históricos con números antiguos siguen listando y con su saldo intacto.
- [ ] Un intento de borrar físicamente un comprobante desde el cliente falla y el comprobante sigue existiendo con su saldo.
- [ ] `npm test`, `npm run lint` y `npm run build` pasan.

## Decisions

- **Sí:** numeración manual validada. El usuario digita el número del comprobante de imprenta; la app valida el formato y la BD impide duplicados.
- **No:** secuencia automática como la de recibos. Solo aplica si dejaran de usar comprobantes pre-impresos.
- **Sí:** unicidad por `(owner_id, voucher_kind, voucher_number)`. Un proveedor puede usar el mismo número que un cliente nuestro.
- **Sí:** formato validado solo en zod, sin CHECK en la BD. No rompe comprobantes históricos.
- **Sí:** guard de edición en dos capas (pantalla + trigger), siguiendo el patrón de SPEC 27/30 para pagos.
- **Sí:** eliminar la política RLS `comprobante_delete`. La inmutabilidad SUNAT exige que un comprobante emitido no se borre; la baja es lógica con `deleted_at`.
- **Sí:** la regla factura/boleta bloquea solo en ventas. En compras se registra lo que entregó el proveedor; el IGV recuperable es tema del contador (spec futura).
- **No:** NC/ND, exonerado/inafecto, moneda, crédito fiscal, dígito verificador del RUC y unificación del código duplicado. Cada uno va en su propia spec si llega.

## Risks

| Risk | Mitigation |
| --- | --- |
| Históricos vivos con números duplicados hacen fallar el índice único | Verificado el 2026-10-15: 0 duplicados, 0 números fuera de formato y 0 comprobantes de compra, así que el índice se crea directo sin renombrar. Si aparecieran duplicados nuevos antes de implementar, se renombran con sufijo `(2)` acordado con el usuario. |
| El trigger consulta las asignaciones en cada UPDATE de comprobante | Solo se dispara en UPDATE y la suma corre sobre las pocas asignaciones del comprobante. |
| Bloquear edición de un comprobante cobrado puede frustrar correcciones legítimas | La corrección formal es NC/ND (spec futura); mientras tanto, anular el pago (void, ya existe) libera el guard. |
| `npm run gen:types` no corre sin el CLI de Supabase | Regenerar tipos vía MCP, como se hizo en SPEC 32/34. |

## What is **not** in this spec

- NC/ND y `comprobante_referenciado`.
- Exonerado/inafecto/exportación y moneda del comprobante.
- Crédito fiscal en compras.
- Umbral de boleta (nombre + DNI del comprador).
- Dígito verificador del RUC.
- Unificación del código duplicado ventas/compras.
- CPE electrónico.

Cada uno de esos, si llega, va en su propia spec.
