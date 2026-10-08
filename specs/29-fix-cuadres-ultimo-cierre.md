# SPEC 29 — Fix: el detalle de cuadres de caja no carga datos (último cierre)

> **Estado:** Implementado
> **Depende de:** SPEC 19, SPEC 21
> **Fecha:** 2026-10-08
> **Objetivo:** Corregir `getLastClose` para que el detalle de cuadres de caja cargue cuando una cuenta tiene más de un cierre, y mapear `PGRST116` a un mensaje entendible.

## Why this spec exists

`/cajas-bancos/cuadres` dejó de mostrar datos para cuentas con más de un cierre y muestra el toast genérico "No se pudo completar la operación con la base de datos. Intenta nuevamente.".

Causa raíz verificada:

- `getLastClose` (`lib/caja/caja.ts`) ejecuta `.eq("cash_account_id", id).order("period_end", { ascending: false }).maybeSingle()` **sin `.limit(1)`**.
- Cuando la cuenta tiene 2 o más cierres, supabase-js lanza el error `PGRST116` ("JSON object requested, multiple rows returned") aunque el HTTP visible sea `200` con un array.
- `PGRST116` no está en el `switch` de `mapError`, así que la UI recibe el mensaje genérico.
- `CuadresView.fetchAccount` resuelve cuatro llamadas en un `Promise.all`; el rechazo de `getLastClose` aborta el `Promise.all` completo, de modo que **ninguna** `setState` corre: la tabla de cierres, el saldo, el último cierre y el período sugerido quedan vacíos.

La base de demo (SPEC 21) traía un solo cierre por cuenta, así que el error no aparecía hasta que se creó un segundo cierre real.

Descartado en el diagnóstico: RLS (las políticas SELECT de `cash_close` existen), las RPC de caja (`get_cash_position` responde), los `.single()` del resto del repositorio (van siempre por `id` único), `payment_balance` con `maybeSingle` (máximo una fila por pago) y SPEC 28 (su fase B2 solo añadió ordenamiento). Los dobles fetch observados en desarrollo son el doble montaje de React StrictMode.

## Scope

**In:**

- `lib/caja/caja.ts` → `getLastClose`: agregar `.limit(1)` antes de `.maybeSingle()`, de modo que devuelva determinísticamente el cierre más reciente (`order("period_end", { ascending: false })` + `limit(1)`).
- Endurecer `mapError` para que `PGRST116` produzca un mensaje legible en lugar del genérico, en:
  - `lib/caja/caja.ts`
  - `lib/pagos/pagos.ts`
- `tests/__mocks__/supabase.ts`: agregar `.limit()` al `QueryBuilder` (encadenable) para que el mock soporte el nuevo uso.
- Test unitario de regresión `tests/unit/lib/caja/caja.test.ts` para `getLastClose`: con 2 filas (ordenadas desc) devuelve la más reciente y no lanza; con 0 filas devuelve `null`.

**Out of scope (for future specs):**

- Cierres con fechas de período futuras (existe un cierre con `period_end` 2026-10-09, posterior a hoy). Se registra como hallazgo; no se corrige aquí.
- Cambios de BD, RLS o RPC: el fix es solo client-side y de manejo de errores.
- Rediseño o cambios funcionales de la vista de Cuadres (SPEC 19/SPEC 28).
- Un barrido que generalice `mapError` con una tabla de códigos compartida entre todos los dominios.

## Data model

Esta spec **no introduce nuevas estructuras de datos ni cambios de BD**. Reutiliza:

- `CashClose` (`components/pagos/types.ts`) y el mapeo `mapCashCloseRow` (`lib/caja/caja.ts`), sin cambios.
- El cliente `supabase` de `@/lib/supabase/client`.

Ajuste de comportamiento en `getLastClose` (misma firma, misma salida):

```ts
// antes
supabase.from("cash_close").select("*").eq("cash_account_id", accountId)
  .order("period_end", { ascending: false }).maybeSingle();
// después
supabase.from("cash_close").select("*").eq("cash_account_id", accountId)
  .order("period_end", { ascending: false }).limit(1).maybeSingle();
```

Mapeo nuevo de error (en el `switch` de `mapError`):

```ts
if (error.code === "PGRST116") {
  return new Error("La consulta devolvió más registros de los esperados.");
}
```

## Implementation plan

1. En `lib/caja/caja.ts`, agregar `.limit(1)` a `getLastClose` (entre `.order(...)` y `.maybeSingle()`). `npm run lint`.
2. En `mapError` de `lib/caja/caja.ts` y de `lib/pagos/pagos.ts`, agregar el caso `PGRST116` con el mensaje "La consulta devolvió más registros de los esperados.". `npm run lint`.
3. En `tests/__mocks__/supabase.ts`, agregar `limit: (n: number) => QueryBuilder` (encadenable, sin filtrar) al `QueryBuilder` y a `makeBuilder`.
4. Crear `tests/unit/lib/caja/caja.test.ts` con los tests de `getLastClose` (2 filas → la más reciente; 0 filas → `null`), inyectando el mock de Supabase. `npm run test:unit`.
5. Validación final: `npm run lint` + `npm test` + `npm run build`, y verificación con navegador en `/cajas-bancos/cuadres` con una cuenta que tenga 2 cierres.

## Acceptance criteria

- [x] `getLastClose` usa `.limit(1)` antes de `.maybeSingle()` y devuelve el cierre con mayor `period_end`.
- [x] `mapError` de `lib/caja/caja.ts` y `lib/pagos/pagos.ts` traduce `PGRST116` a "La consulta devolvió más registros de los esperados.".
- [x] El `QueryBuilder` del mock de Supabase expone `limit()` encadenable.
- [x] `tests/unit/lib/caja/caja.test.ts` pasa: con 2 filas devuelve la más reciente y con 0 filas devuelve `null`.
- [x] En `/cajas-bancos/cuadres`, para una cuenta con 2 cierres, se ven el saldo a hoy, el último cierre y el historial con las 2 filas, y **no** aparece el toast "No se pudo completar la operación con la base de datos.".
- [x] No hay errores en la consola del navegador al cargar `/cajas-bancos/cuadres`.
- [x] `npm run lint`, `npm test` y `npm run build` pasan sin errores.

## Decisions

- **Sí:** agregar `.limit(1)` en `getLastClose`. Es la causa raíz; el `order desc` + `limit 1` hace determinista "el último cierre" y elimina el `PGRST116`.
- **Sí:** mapear `PGRST116` en ambos `mapError` (caja y pagos). Defensa de bajo costo que evita que un futuro error similar vuelva a mostrarse como mensaje genérico. Elección del usuario.
- **Sí:** test unitario de regresión y extender el mock con `.limit()`. Elección del usuario; el repositorio ya usa este mock en `lib/pagos`/`lib/clientes`.
- **No:** cambios de BD/RLS/RPC. El fix es client-side y de manejo de errores.
- **No:** generalizar `mapError` a una tabla de códigos compartida; se mantiene el patrón actual por dominio.
- **No:** corregir cierres con fecha de período futura; se anota como hallazgo para una spec posterior.

## Risks

| Riesgo | Mitigación |
| --- | --- |
| Otros `maybeSingle()` del repo podrían sufrir `PGRST116` si su query deja de ser unívoca | Auditoría en esta spec: solo `getLastClose` tiene riesgo (el `payment_balance` por `payment_id` es de máximo una fila); el mapeo de `PGRST116` da visibilidad a cualquier caso futuro |
| El mock de Supabase podría no reflejar el comportamiento real de `limit()` | El mock solo encadena (no filtra), suficiente para probar que la cadena no rompe y que se toma la primera fila ya ordenada por la query |
| Un cierre con `period_end` futuro podría confundir el "período sugerido" | Fuera de alcance; se documenta como hallazgo. El fix no cambia esa lógica |

## What is **not** in this spec

- Cierres con fechas de período futuras.
- Cambios de BD, RLS o RPC.
- Rediseño funcional de la vista de Cuadres.
- Unificación de `mapError` en una utilidad compartida.

Cada uno de esos, si aterriza, va en su propia spec.
