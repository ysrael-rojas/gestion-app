# SPEC 51 — Acta de arqueo imprimible y extracto por rango

> **Status:** Implementado
> **Depends on:** SPEC 19, SPEC 32, SPEC 35, SPEC 49, SPEC 50
> **Date:** 2026-10-27
> **Objective:** Que el dueño pueda imprimir el acta de arqueo de un cierre (con denominaciones, diferencia, resultado y doble firma) y consultar los movimientos de cualquier cuenta en un rango libre con descarga a Excel, sin escribir fechas raras ni entender tecnicismos.

## Why this spec exists

Dos de los cuatro reportes que faltan en el módulo de tesorería (auditoría del 2026-10-27):

- **F4 — no hay acta de arqueo.** El procedimiento estándar peruano de arqueo exige un documento con el conteo por denominación, el total de valores en caja (A), el fondo de cambio (B), el efectivo neto (A−B), el saldo según registros (C), la diferencia (A−B−C), el resultado (Cuadrado/Faltante/Sobrante), la secuencia de recibos del período y **doble firma** (cajero y arqueador). Hoy el cuadre solo se ve en pantalla y se exporta a CSV: no hay nada que imprimir ni archivar, y no existe ningún campo que registre quién contó ni quién revisó.
- **F8 — no hay extracto por rango libre.** Los movimientos de una cuenta solo se ven acotados al período de un cierre ya hecho (`cuadres-view.tsx`). Para entregarle algo al contador, revisar un mes o buscar un cobro, hoy hay que cerrar la caja. `listAccountStatement(accountId, from, to)` y `listAccountTransfers(accountId, from, to)` ya aceptan cualquier rango: falta la pantalla.

Restricción transversal del usuario: **el consumidor final es un dueño de negocio, no un técnico**. Por eso esta spec prioriza un clic para imprimir, rangos por defecto que tengan sentido (mes actual), etiquetas en lenguaje simple ("¿Quién contó la caja?") y estados vacíos que expliquen qué hacer.

Esta spec es la primera de tres del bloque de reportes: **51 acta y extracto → 52 flujo de caja proyectado → 53 conciliación bancaria formal** (las dos últimas requieren decisiones de datos propias y se diseñan aparte).

## Scope

**In:**

1. **Nombres en el cierre (doble firma).** `cash_close` gana `counted_by varchar(100) null` (quién contó) y `verified_by varchar(100) null` (quién revisó). `close_cash_account` recibe `p_counted_by` y `p_verified_by` opcionales (default null, con `nullif(trim(…))`). Sin backfill: los cierres históricos quedan en null.
2. **El modal de cierre los pide en lenguaje simple.** Dos campos de texto opcionales en `CashCloseModal`: "¿Quién contó la caja?" y "¿Quién revisó el arqueo?", con la pista "Si lo hiciste tú, escribe tu nombre. Se imprime en el acta." Se guardan vía `closeCashAccount` y se muestran en `CuadreReport` ("Contado por" / "Revisado por", o "—" si faltan).
3. **Acta imprimible (`cuadre-acta.tsx`).** Documento A4 que sigue el patrón de impresión existente (`createPortal` al `body` + `@media print` que oculta todo lo demás, como `receipt-dialog.tsx`), con CSS nuevo en `app/globals.css`: `.cuadre-print-portal` y `@page { size: A4; margin: 12mm }`. Contenido, en este orden:
   - Encabezado: "Acta de arqueo de caja" (o "Cuadre de cuenta bancaria" en bancos), nombre de la cuenta, período, periodicidad y fecha de impresión.
   - Resumen: saldo inicial, ingresos, egresos, transferencias entrantes/salientes, **saldo según registros (C)**.
   - Arqueo por denominación (solo cajas): Denominación / Cantidad / Subtotal, **Total valores en caja (A)**, **Menos fondo de cambio (B)**, **Efectivo neto (A − B)**, **Diferencia (A − B − C)** y resultado (Cuadrado / Faltante / Sobrante), tolerancia y motivo si lo hubo.
   - Recibos del período (secuencia por prefijo, p. ej. `RI-000012 → RI-000031`) y cantidad de anulados.
   - Notas del cierre y, al pie, **dos líneas de firma**: "Firma del cajero" con `counted_by` y "Firma del arqueador" con `verified_by` (en blanco si no se registraron).
   - En bancos: sin bloque de denominaciones y con el conteo etiquetado "Saldo según extracto".
   - **No incluye** la lista de movimientos ni el resumen por categoría (quedan en pantalla y en el CSV) para que el acta quepa en una página.
4. **Botón "Imprimir acta"** en la cabecera de `CuadreReport`, junto a "Exportar CSV". Un clic abre el diálogo de impresión del navegador.
5. **Página de extracto por rango**: ruta `app/(app)/cajas-bancos/extractos/page.tsx` + `components/cajas-bancos/extractos-view.tsx`, con entrada "Extractos" en el navbar (grupo Caja y bancos).
   - Selector de cuenta (por defecto la primera activa) y rango **Desde / Hasta con el mes actual precargado** (`getMonthRange`), más atajos "Este mes" / "Mes anterior".
   - Tabla reutilizando `StatementTable` **sin handlers** (modo lectura: sin checkboxes ni "Marcar verificado") con recibos y transferencias mezclados por fecha y su estado.
   - Resumen encima de la tabla: ingresos, egresos y número de movimientos (excluyendo anulados), más el conteo de transferencias.
   - **"Descargar CSV (se abre en Excel)"**: cabecera con cuenta y rango, columnas Fecha / Tipo / Recibo / Dirección / Categoría / Método / Importe / Estado (los anulados se incluyen, marcados), nombre `extracto-{cuenta}-{desde}_{hasta}.csv`.
   - Estado vacío con guía: "Elige una cuenta y un rango para ver los movimientos."
6. **Helper puro** `summarizeStatement(statement, transfers)` en `lib/caja/reportes.ts`: totales de ingresos/egresos excluyendo `ANULADO` y conteo de transferencias (testeable sin DOM).
7. Tras la migración: verificar `lib/supabase/types.ts` contra `generate_typescript_types` (MCP) y versionar el SQL en `supabase/migrations/`.
8. Tests: unitarios del helper y del schema del cierre con los nombres nuevos; de componente del acta (caja con denominaciones y firmas, banco sin denominaciones, cierre histórico sin nombres), del extracto (rango por defecto, filas, CSV, estado vacío) y del modal de cierre (campos opcionales).

**Out of scope (for future specs):**

- **SPEC 52 — flujo de caja proyectado** (semanal/mensual, con alerta de saldo negativo) usando solo la cartera con vencimientos.
- **SPEC 53 — conciliación bancaria formal** (saldo según extracto ± partidas en tránsito / no cobrados / cargos y abonos no registrados = saldo conciliado vs libros), que requiere tablas nuevas.
- Librerías de PDF (el acta se imprime desde el navegador; el navegador guarda en PDF si el dueño lo necesita).
- Aging de cartera (1-30 / 31-60 / +60), indicadores DSO o días de caja.
- Firmas digitales, imágenes de firma o adjuntos escaneados.
- Acta de arqueo sorpresivo (`cash_count`): esta spec cubre el cierre; el arqueo sorpresivo sigue en pantalla (su acta puede reutilizar el componente en una spec futura).
- Extracto por rango con filtros de estado o paginación en servidor.

## Data model

```sql
-- 1) Quién contó y quién revisó (doble firma del acta)
alter table public.cash_close
  add column counted_by  varchar(100),
  add column verified_by varchar(100);

-- 2) close_cash_account gana dos parámetros opcionales al final de la firma
--    (p_counted_by text default null, p_verified_by text default null) y los
--    guarda con nullif(trim(...)). Sin otros cambios: la fórmula de saldo
--    esperado, la tolerancia y el motivo siguen igual (SPEC 49).
```

Sin backfill ni vistas nuevas. El extracto no toca la BD: usa las consultas existentes.

```ts
// components/pagos/types.ts — CashClose gana:
countedBy: string | null;   // quién contó la caja
verifiedBy: string | null;  // quién revisó el arqueo

// lib/schemas/cash-close.ts — campos opcionales
countedBy: z.string().trim().max(100).optional(),
verifiedBy: z.string().trim().max(100).optional(),

// lib/caja/reportes.ts — helper puro nuevo
export interface StatementSummary {
  income: number;
  expense: number;
  movements: number;      // recibos no anulados
  transfers: number;
}
export function summarizeStatement(
  statement: Array<{ direction: string; amount: number; status: string }>,
  transfers: unknown[]
): StatementSummary;

// components/cajas-bancos/cuadre-acta.tsx — documento imprimible
interface CuadreActaProps {
  close: CashClose;
  accountName: string;
  accountType: CashAccountType;
  currency: Currency;
  denominations: CloseDenomination[];
  statement: Payment[];   // solo para la secuencia de recibos
}

// components/cajas-bancos/extractos-view.tsx — vista de extracto
// Estado local (cuenta + rango); sin searchParams: es una consulta puntual.
```

## Implementation plan

1. Cargar `supabase-postgres-best-practices`. **Migración**: `cash_close.counted_by`/`verified_by` + `close_cash_account` con los dos parámetros nuevos. Versionar el SQL y verificar `lib/supabase/types.ts` contra `generate_typescript_types`.
2. **Cliente del cierre**: `CashClose` con los campos, `mapCashCloseRow`, `closeCashAccount` los envía, `cashCloseSchema` los valida (opcionales, máx. 100), `CashCloseModal` los pide con etiquetas simples y `CuadreReport` los muestra. Tests de schema y de componente.
3. **Acta imprimible**: `cuadre-acta.tsx` + portal y CSS de impresión en `globals.css` (`.cuadre-print-portal`, `@page` A4) + botón "Imprimir acta" en `CuadreReport`. Tests de componente (caja, banco, cierre histórico sin nombres).
4. **Extracto**: `summarizeStatement` en `lib/caja/reportes.ts`, ruta `app/(app)/cajas-bancos/extractos/page.tsx`, `extractos-view.tsx` (cuenta, rango por defecto mes actual, `StatementTable` en modo lectura, resumen, CSV), ítem "Extractos" en `app-navbar.tsx`. Tests del helper y de la vista.
5. **Validación final**: prueba de integración en la BD con `rollback` (cerrar una caja con `counted_by`/`verified_by` y leerlos de vuelta), `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build` y revisión de advisors.

## Acceptance criteria

- [x] El modal de cierre ofrece "¿Quién contó la caja?" y "¿Quién revisó el arqueo?" (opcionales) y los guarda; `CuadreReport` los muestra como "Contado por" / "Revisado por" (o "—"). Integración en BD: nombres con trim, null si vacío; tests de schema, RPC y componente.
- [x] Un clic en "Imprimir acta" abre la impresión del navegador mostrando **solo** el acta: cuenta, período, periodicidad y fecha de impresión. Portal propio y `@page` A4 inyectado solo mientras está montada (no afecta el recibo térmico); test verifica `window.print`.
- [x] El acta de una caja incluye el conteo por denominación con A, B, A−B, saldo según registros (C), diferencia, tolerancia, motivo (si lo hubo) y resultado (Cuadrado/Faltante/Sobrante). Tests de componente.
- [x] El acta muestra la secuencia de recibos del período y la cantidad de anulados. Test: "RI-000001 → RI-000005" y conteo.
- [x] El acta termina con dos líneas de firma ("Firma del cajero" / "Firma del arqueador") con los nombres registrados, o en blanco si el cierre no los tiene.
- [x] En una cuenta bancaria el acta no muestra denominaciones y etiqueta el conteo como "Saldo según extracto". Test del variante banco.
- [x] Los cierres históricos (sin `counted_by`/`verified_by`) se imprimen sin errores y con las firmas en blanco. Test del cierre sin nombres.
- [x] `/cajas-bancos/extractos` existe, aparece en el navbar bajo "Caja y bancos" y abre con el mes actual precargado. Test: valores de Desde/Hasta = mes actual.
- [x] El extracto permite cambiar de cuenta y de rango (con atajos "Este mes" / "Mes anterior") y lista recibos y transferencias por fecha, con su estado, sin acciones de verificación (`StatementTable` sin handlers).
- [x] El extracto muestra el resumen (ingresos, egresos, movimientos, transferencias) excluyendo los anulados de los totales. Test de `summarizeStatement` y de la vista.
- [x] "Descargar CSV (se abre en Excel)" genera `extracto-{cuenta}-{desde}_{hasta}.csv` con cabecera de cuenta/rango y las ocho columnas del extracto. Test del nombre y contenido.
- [x] Sin rango o sin movimientos, la página explica qué hacer ("No hay movimientos en ese rango. Prueba con otras fechas o elige «Este mes»."). Test del vacío.
- [x] No hay librerías de PDF nuevas y `close_cash_account` solo gana los dos parámetros opcionales (misma lógica de SPEC 49).
- [x] `lib/supabase/types.ts` verificado contra `generate_typescript_types`, migración versionada en `supabase/migrations/`, y `npx tsc --noEmit`, `npm run lint`, `npm test` (571 tests) y `npm run build` en verde; advisors sin hallazgos nuevos.

## Decisions

- **Sí:** acta en HTML imprimible con el patrón de portal ya existente. **No:** librería de PDF (dependencia y peso nuevos; el navegador ya guarda en PDF desde el diálogo de impresión).
- **Sí:** nombres de cajero y revisor guardados en `cash_close`. **No:** escribirlos solo al imprimir (no quedaría registro de quién firmó) ni usar únicamente `custodian_name` (el custodio es de la caja chica, no de cualquier cuenta).
- **Sí:** dos campos opcionales con etiquetas en primera persona ("¿Quién contó la caja?"). **No:** campos obligatorios (bloquearía el cierre diario) ni etiquetas técnicas (`counted_by`, "responsable del conteo físico").
- **Sí:** el acta ocupa una página: sin lista de movimientos ni resumen por categoría. **No:** imprimir todo el cuadre (el detalle ya está en pantalla y en el CSV).
- **Sí:** página propia `/cajas-bancos/extractos` con entrada en el navbar. **No:** meterlo dentro de Cuadres (mezcla la lectura del cierre con la consulta libre) ni un diálogo desde Cuentas (menos espacio para la tabla).
- **Sí:** rango por defecto = mes actual y estado local, sin `searchParams`. **No:** URL con filtros (los listados de pagos la usan, pero el extracto es una consulta puntual y el dueño no comparte enlaces).
- **Sí:** reutilizar `StatementTable` sin handlers para el extracto. **No:** una tabla nueva (duplicaría columnas, estados y orden).
- **Sí:** los anulados se incluyen en el extracto marcados como Anulado y se excluyen de los totales. **No:** ocultarlos (el dueño necesita ver que existieron) ni sumarlos (inflarían el ingreso/egreso).
- **Sí:** label "Descargar CSV (se abre en Excel)". **No:** "Exportar CSV" a secas (el dueño no sabe qué es un CSV).
- **No** en esta spec: flujo proyectado (SPEC 52), conciliación formal (SPEC 53), aging, firmas digitales y acta del arqueo sorpresivo.
- **Pase previo por `frontend-design`** (2026-10-27): "el acta es un documento, no una pantalla" — al imprimir desaparece el chrome; números primero, firmas al final; el título en mayúsculas pertenece al formato oficial de arqueo, no es un adorno; en pantalla se usan los tokens del tema y en impresión negro sobre blanco; tabular-nums en todos los montos.
- **Corrección de implementación (2026-10-27):** `CashClose` no exponía `transferInTotal`/`transferOutTotal` (estaban en la tabla y en el select, pero no en el tipo ni en el mapper); se añadieron porque el acta imprime las transferencias del período.
- **Corrección de implementación (2026-10-27):** el acta no repite "Contado por / Revisado por" en el resumen; los nombres van en las líneas de firma para no duplicar el dato y mantener una página.
- **Corrección de implementación (2026-10-27):** el mock de Supabase de los tests ganó `.or()`, que usan las consultas de transferencias del extracto.

## Risks

| Risk | Mitigation |
| --- | --- |
| Dos portales de impresión (recibo y acta) peleando por `@media print` | CSS con clases propias por portal y regla de que solo el portal activo se muestra; el acta se monta solo mientras está abierta |
| El acta se corta en varias páginas | Contenido acotado (sin movimientos ni categorías), `@page` A4 con margen 12 mm y tipografía compacta; se verifica con una caja de 11 denominaciones |
| Cierres históricos sin nombres | Columnas nullable; el acta imprime líneas de firma en blanco y el reporte muestra "—" |
| Cambiar la firma de `close_cash_account` rompe llamadas viejas | Parámetros con `default null` al final; `closeCashAccount` los envía siempre (vacío → null) |
| Extracto con rango enorme (varios años) | Rango por defecto de un mes y aviso si el rango supera 12 meses; la consulta ya va ordenada y paginada en la tabla |
| El dueño no entiende "CSV" | Etiqueta "Descargar CSV (se abre en Excel)" y cabecera del archivo con cuenta y rango en texto plano |
| Migraciones vía MCP sin CLI instalada | Versionar el SQL en `supabase/migrations/` y verificar los tipos contra `generate_typescript_types` |

## What is **not** in this spec

Flujo de caja proyectado (SPEC 52); conciliación bancaria formal con partidas en tránsito (SPEC 53); PDF con librería; aging de cartera; firmas digitales o adjuntos; acta del arqueo sorpresivo; extracto con filtros por estado o paginación en servidor; y cualquier cambio a la fórmula de saldo esperado, la tolerancia o los estados de recibo.
