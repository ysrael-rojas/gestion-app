# SPEC 20 — Datos demo para el módulo de caja y bancos

> **Estado:** Aprobado
> **Depende de:** SPEC 19
> **Fecha:** 2026-10-06
> **Objetivo:** Cargar datos de prueba (clientes, facturas de venta y recibos de ingreso en cuentas de caja/banco) en la DB de Supabase para explorar el módulo de caja y bancos con datos realistas.

## Alcance

**Dentro:**

- `supabase/seed-demo.sql` — script idempotente (purga + siembra), ejecutado vía MCP `execute_sql`. No es migración: no crea esquema.
- Purga de todos los datos del owner `yrra_rojas@hotmail.com` (`7f9e00ea-c5a0-4ddb-b72c-4f6ad912f782`): `entidad`, `comprobante`, `payment`, `payment_allocation`, `cash_close`, `cash_account` + `truncate receipt_sequence` (global, sin owner). Se conservan `payment_method` (3) y `cash_receipt_category` (8) existentes.
- Siembra para ese owner: 2 cuentas de caja/banco (1 `CASH_BOX` "Caja General" + 1 `BANK_ACCOUNT` "Banco BCP"), 6 clientes ficticios, 14 facturas de venta (`FF01-…`) con fechas repartidas en los últimos ~75 días, contado y crédito, montos variados en PEN.
- ~10 recibos de ingreso (`payment` + `payment_allocation`): 3 facturas `PAGADO` (saldo 0), 4 con pago parcial (siguen `PENDIENTE` con saldo > 0) y 7 `PENDIENTE` sin ningún pago; recibos en ambas cuentas, con métodos EFECTIVO / TRANSFERENCIA_BCP / TARJETA_CREDITO y categoría "Cobranza de venta".
- Los recibos se insertan directo en `payment` + `payment_allocation`. La DB asigna `receipt_serial` (trigger `assign_receipt_number`), genera `receipt_number` (`RI-/RE-NNNNNN`) y recalcula `comprobante.status` (trigger `allocation_refresh_status` → `refresh_comprobante_status`). El seed no escribe esos campos a mano.

**Fuera del alcance (para futuras specs):**

- Compras, proveedores y pagos de egreso (no elegidos en esta definición).
- Anticipos de cliente sin factura (SPEC 18) — fuera.
- Cierres de caja sembrados: los hace el usuario desde la UI para probar el arqueo.
- Botón "cargar/limpiar datos demo" en la app: es un script de repo, no funcionalidad.
- Datos para `ysrael@google.com`.

## Modelo de datos

Esta spec **no introduce estructuras nuevas**. Reutiliza el modelo de SPEC 19 (`entidad`, `comprobante`, `payment`, `payment_allocation`, `cash_account`, `payment_method`, `cash_receipt_category`). Convenciones del seed:

```sql
-- owner fijo de la demo (yrra_rojas@hotmail.com)
-- los inserts van con owner_id explícito; RLS no aplica al dueño de la tabla
-- (no FORCE RLS), así que el SQL de postgres inserta sin sesión de auth
voucher_kind 'VENTA', voucher_type 'FACTURA', moneda PEN
recibos: type 'INGRESO', category_id = "Cobranza de venta"
```

## Plan de implementación

1. Crear `supabase/seed-demo.sql` con el bloque de **purga** idempotente (delete por owner + truncate de `receipt_sequence`). Ejecutar y verificar counts en 0.
2. Añadir al script la siembra de **2 cuentas de caja/banco**. Ejecutar y verificar en `/cajas-bancos/configuracion`.
3. Añadir la siembra de **6 clientes**. Verificar en `/clientes`.
4. Añadir la siembra de **14 facturas** (fechas últimos 75 días, contado/crédito, `PENDIENTE`). Verificar en `/ventas`.
5. Añadir la siembra de **~10 recibos** (payments + allocations + recálculo de status + `receipt_sequence`). Verificar saldos en `/cajas-bancos/cuentas` e historial en `/cajas-bancos/cuadres`.
6. **Prueba de idempotencia:** re-ejecutar el script completo y comparar counts (deben ser idénticos).
7. Verificación final logueado como `yrra_rojas@hotmail.com`: recorrer las pantallas del módulo.

## Criterios de aceptación

- [ ] El script corre 2 veces seguidas sin error ni duplicados (counts idénticos tras cada corrida).
- [ ] `/clientes` muestra 6 clientes para el owner de la demo (ya no GREEN PLAST).
- [ ] `/ventas` muestra 14 facturas: 3 `PAGADO`, 4 `PENDIENTE` con pago parcial (saldo > 0) y 7 `PENDIENTE` sin pago.
- [ ] El detalle de una factura `PARCIAL` muestra su historial de pagos con recibo, cuenta y método.
- [ ] `/cajas-bancos/cuentas` muestra 2 cuentas con saldo > 0 (suma de ingresos − egresos a hoy, en PEN).
- [ ] `/cajas-bancos/cuadres` muestra posición de efectivo y permite cerrar el día de ayer sin error.
- [ ] Tras un cierre manual, intentar registrar un recibo con fecha anterior al cierre es bloqueado por la base.
- [ ] `npm run lint`, `npm test` y `npm run build` pasan (el cambio es solo SQL; nada de código de app debe romperse).

## Decisiones

- **Sí:** purga + re-siembra completa del owner demo (decisión del usuario: purgar los datos existentes, incluido GREEN PLAST y FF01-22333).
- **Sí:** script versionado `supabase/seed-demo.sql` y no SQL one-off. Queda reproducible en el repo y sirve como demo permanente.
- **Sí:** insertar `payment` + `payment_allocation` directo por SQL y dejar que los triggers de la base asignen `receipt_serial`, generen `receipt_number` y recalculen `comprobante.status`. No se llama la RPC `create_payment_with_allocations` porque exige sesión con `auth.uid()`.
- **Sí:** "pago parcial" se representa como `PENDIENTE` con saldo > 0. El enum `comprobante_status` no tiene estado `PARCIAL` (decisión del usuario).
- **No:** sembrar cierres de caja — son irreversibles por diseño (SPEC 19) y cerrarían el pasado, impidiendo que el usuario experimente con el arqueo.
- **No:** anticipos ni compras — el usuario no los eligió; encajarían mejor en una spec aparte si hace falta más tarde.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Los triggers de validación (`validate_allocation`, `assert_payment_account_open`) rechazan inserts que no cumplan las reglas de negocio | El seed usa importes ≤ saldo del comprobante, entidad del pago = entidad del comprobante y fechas posteriores a cualquier cierre (no hay cierres sembrados) |
| `FORCE ROW LEVEL SECURITY` en alguna tabla bloquearía los inserts sin sesión | Verificado en SPEC 16: RLS estándar por dueño, sin FORCE; si algún insert falla, se documenta en el script |
| `receipt_sequence` es global y sin owner: el truncate lo resetea a 0 para ambas direcciones | Aceptado: la demo parte de correlativos limpios (mismo enfoque que la purga de SPEC 19) |

## Lo que **no** está en esta spec

- Compras/egresos, anticipos, cierres sembrados, botón demo en la UI, datos para el segundo usuario.
