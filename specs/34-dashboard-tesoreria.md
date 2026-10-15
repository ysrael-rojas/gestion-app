# SPEC 34 — Dashboard de tesorería (índice del módulo)

> **Status:** Implementado
> **Depends on:** SPEC 31
> **Date:** 2026-10-14
> **Objective:** Portada `/cajas-bancos` con posición consolidada de efectivo, resultado del mes y cartera breve, para que el dueño vea en una pantalla cuánto tiene, de dónde viene y hacia dónde va.

## Why this spec exists

El módulo no tiene dashboard: solo hay cierre por cuenta (`cuadre-report`) y statement del período. La función `listCashPositions` existe en `lib/caja/caja.ts` pero **ninguna vista la consume** (código muerto) y, además, lanza una RPC por cuenta (N+1, brecha #9). `cuentas-view.tsx` y `general-settings-card.tsx` no muestran saldos. El dueño de una MYPE necesita una sola pantalla con el disponible total, el desglose por cuenta y el resultado del período; esta spec la crea como índice del módulo.

## Scope

**In:**

- Ruta `/cajas-bancos` como índice del módulo.
- RPC consolidada `get_cash_positions` (una sola llamada devuelve los saldos de todas las cuentas; reemplaza el N+1 de `listCashPositions`).
- Tarjetas: disponible total, desglose por cuenta (caja vs. banco, PEN), resultado del mes (ingresos − egresos), cartera breve (total y vencido desde `voucher_balance`).
- Accesos rápidos a cuadres, conciliación y cuentas.
- Tests unitarios (helpers puros) + `npm run lint` + `npm run build`.

**Out of scope (for future specs):**

- Flujo de caja proyectado.
- Gráficos históricos o series de tiempo.
- Multi-moneda real (PEN único; TC fijo informativo).
- Dashboard global de la app en `/` (cruza dominios de ventas/compras).

## Data model

Sin tablas ni columnas nuevas.

- **RPC `get_cash_positions(p_as_of date default null)`** → `table(account_id uuid, name text, type cash_account_type, currency text, balance numeric)`: calcula el balance de cada cuenta activa del owner con la misma lógica de SPEC 31 (incluye transferencias entrantes/salientes). Una sola llamada para todas las cuentas.
- **Cartera:** reusa la vista `voucher_balance` (comprobante, total, pagado, saldo, vencimiento) para total y saldo vencido.

## Implementation plan

1. Migración de la RPC `get_cash_positions` vía Supabase MCP `apply_migration` + `npm run gen:types`.
2. `lib/caja/caja.ts`: `listCashPositionsConsolidated()` que llama a la RPC única (depreca el bucle N+1).
3. `app/(app)/cajas-bancos/page.tsx` + `components/cajas-bancos/dashboard-view.tsx` (shadcn Cards, `Intl.NumberFormat("es-PE")`).
4. Cargar datos con pocas llamadas: posiciones (1 RPC), movimientos del mes (para resultado) y cartera (vista).
5. Navegación: `/cajas-bancos` como raíz del módulo; enlazar desde la navegación/sidebar existente.
6. Tests unitarios (helpers de agregación) + `npm run lint` + `npm run build`.

## Acceptance criteria

- [x] `/cajas-bancos` carga los saldos de todas las cuentas con una única RPC (sin N+1).
- [x] El total disponible cuadra con la suma de las cuentas individuales.
- [x] El resultado del mes (ingresos − egresos) cuadra con los movimientos del período.
- [x] La tarjeta de cartera muestra total y saldo vencido.
- [x] La vista funciona con cuentas mixtas caja/banco y muestra el tipo de cada una.
- [x] Los montos se muestran en formato `es-PE` (S/).
- [x] `npm test`, `npm run lint` y `npm run build` pasan.

## Decisions

- **Yes:** el dashboard vive en el índice del módulo (`/cajas-bancos`), no en la raíz `/`.
- **Yes:** RPC consolidada en lugar del bucle N+1 existente.
- **Yes:** sin proyección ni gráficos históricos en esta spec.
- **No:** no activar multi-moneda; el desglose es por cuenta en PEN.

## Risks

| Risk | Mitigation |
| --- | --- |
| Sumar transferencias en ambos lados produce doble conteo. | Reutilizar la lógica de balance de SPEC 31 (entrante suma, saliente resta) de forma centralizada. |
| La vista `voucher_balance` puede ser pesada para cartera. | Mostrar solo total y vencido; verificar índices de la vista en advisors. |
| El índice reemplaza el listado actual de cuentas. | Mantener `/cajas-bancos/cuentas` intacto; el índice es una ruta nueva con accesos. |
