# SPEC 52 — Flujo de caja proyectado

> **Status:** Implementado
> **Depends on:** SPEC 09, SPEC 34, SPEC 39
> **Date:** 2026-10-28
> **Objective:** Mostrar en el Resumen de caja y bancos una proyección de 4 semanas del saldo disponible (lo que entrará por cobranzas, lo que saldrá por pagos, y lo que queda), armada solo con la cartera y sus vencimientos, con alerta cuando una semana queda negativa — y de paso corregir que el Resumen hoy suma PEN y USD como si fueran la misma moneda.

## Why this spec exists

La auditoría de tesorería del 2026-10-27 dejó el flujo de caja proyectado como **"el reporte que más evita sorpresas"** (F9): sin él, el dueño descubre que no le alcanza el día que ya no le alcanza. Hoy el módulo solo muestra fotos del pasado (disponible, resultado del mes, cartera) y nada del futuro cercano. El procedimiento de tesorería para MYPE pide revisarlo **semanalmente**.

Decisión del usuario (2026-10-28): la proyección se arma **solo con la cartera y sus vencimientos** — saldo actual de las cuentas + comprobantes pendientes con fecha de vencimiento (`voucher_balance.effective_due_date`) — sin tabla de movimientos previstos manuales (planilla, tributos, alquileres quedan fuera).

**Hallazgo del mapeo (2026-10-28):** el "Disponible total" del Resumen **suma PEN y USD sin convertir** (`summarizePositions` no mira moneda: S/ 1,000 + $500 → muestra "S/ 1,500"). La conversión correcta (`toPen` + TC de Configuración) solo existe en Detalle de Cuentas. La proyección necesita convertir sí o sí, y el usuario decidió corregir el Resumen de paso.

**Tres casos borde que `voucher_balance` obliga a resolver** (detectados en el mapeo):
- **Atrasados**: comprobantes con `effective_due_date` anterior al lunes de la semana en curso (incluye el CONTADO con saldo, cuyo vencimiento es su fecha de emisión).
- **Crédito sin fecha**: `effective_due_date` null cuando un CREDITO se guardó sin `due_date` — no tiene semana asignable.
- Decisión: los atrasados **suman en la semana 1 como línea propia "Atrasado"** (optimista pero transparente); el crédito sin fecha va en **una nota aparte que avisa que no está considerado**.

## Scope

**In:**

1. **Consolidación a soles (`toPen` a `lib/`).** Se mueve `toPen(balance, currency, penUsdRate)` de `cuentas-view.tsx` a `lib/caja/dashboard.ts` (exportada, pura) y se reutiliza en tres lugares: cuentas-view (sin cambio de comportamiento), el Resumen y la proyección.
2. **Corrección del Resumen.** "Disponible total", "En cajas" y "En bancos" y el footer del desglose consolidan con `toPen` y el TC de Configuración (`getPenUsdRate`). Si hay cuentas en USD y no hay TC configurado, USD cuenta como 0 y se muestra una nota visible ("Configura el tipo de cambio en Configuración → General") para que el dinero no desaparezca en silencio.
3. **Helper puro de proyección (`lib/caja/proyeccion.ts`)** — sin consultas, testeable:
   - `startOfWeek(today)`: lunes de la semana en curso (semanas de **lunes a domingo**; nueva utilidad, hoy no existe ninguna).
   - `buildCashFlowProjection({ today, currentBalance, receivables, payables })`: reparte los comprobantes pendientes (`balance > 0`) en 4 semanas; los atrasados (vencimiento < lunes actual) van al bucket de la semana 1 como atrasado; los sin fecha a un apartado que no suma; devuelve el saldo final en cascada y si hay semana negativa.
4. **Componente `CashFlowProjection` (`components/cajas-bancos/cash-flow-projection.tsx`)**, montado en el Resumen entre "Cartera por cobrar" y "Desglose por cuenta":
   - Encabezado: "Disponible hoy: S/ X · N cuentas · TC S/ 3.75".
   - Tabla de 4 columnas de semana (rango corto "26/10 → 01/11") y 4 filas: **Atrasado** (neto, con desglose "por cobrar +X · por pagar −Y" en texto pequeño), **Cobranzas**, **Pagos**, **Queda** (saldo final proyectado en cascada).
   - Semana con "Queda" negativo en **rose** y texto guía debajo: "No te alcanza la semana del NN/NN. Cobra lo atrasado o aplaza el pago."
   - Nota al pie con los créditos sin fecha: "Sin fecha de cobro/pago: S/ X (no está considerado en la proyección)."
   - Nota de alcance: "La proyección usa solo lo ya registrado" (no incluye planilla ni tributos futuros).
   - Datos: `listCashPositionsConsolidated(today)` (convertido con `toPen`), `listOpenVouchers("INGRESO")` y `listOpenVouchers("EGRESO")`, `getPenUsdRate()`.
   - **"Descargar CSV (se abre en Excel)"** con el encabezado (disponible hoy, TC, rango) y la tabla proyectada; nombre `flujo-proyectado-{hoy}.csv`.
5. **Accesos rápidos actualizados** (`QUICK_LINKS` del Resumen): se añade "Extractos" (quedó fuera tras SPEC 51) y un ancla "Ver flujo de caja" que lleva a la sección (`#flujo`).
6. Tests: unitarios de `toPen` (movida) y de `buildCashFlowProjection`/`startOfWeek` (reparto por semanas, atrasados a la semana 1, sin fecha aparte, cascada, semana negativa); de componente de `CashFlowProjection` (tabla, alerta rose, nota sin fecha, CSV) mockeando las funciones de carga.

**Out of scope (for future specs):**

- **SPEC 53 — conciliación bancaria formal** (saldo según extracto ± partidas en tránsito / cargos y abonos no registrados).
- Movimientos previstos manuales (planilla, tributos, alquileres): requieren tabla nueva y mantenimiento de datos; decisión explícita del usuario.
- Aging de cartera (1-30 / 31-60 / +60), indicadores DSO o "días de caja".
- Multi-moneda real (tasas por fecha): los comprobantes no tienen moneda modelada; se asume soles (ver Decisions).
- Gráficos o series históricas del flujo.
- Página propia del flujo (vive como sección del Resumen; puede extraerse a página si algún día el usuario la quiere compartible).

## Data model

**Sin cambios en la BD** (ni migraciones, ni vistas, ni RPC). Todo sale de consultas existentes: `get_cash_positions` (vía `listCashPositionsConsolidated`), `voucher_balance` (vía `listOpenVouchers`), `app_setting.pen_usd_rate` (vía `getPenUsdRate`).

```ts
// lib/caja/dashboard.ts — toPen movida desde cuentas-view.tsx
export function toPen(
  balance: number,
  currency: string,
  penUsdRate: number | null
): number;

// lib/caja/proyeccion.ts — helpers puros nuevos
export function startOfWeek(today: string): string; // lunes de esa semana

export interface ProjectionWeek {
  index: number;            // 0..3
  start: string;            // lunes
  end: string;              // domingo
  overdueCollections: number; // atrasado por cobrar (solo semana 1)
  overduePayments: number;    // atrasado por pagar (solo semana 1)
  collections: number;        // cobranzas que vencen esa semana
  payments: number;           // pagos que vencen esa semana
  closingBalance: number;     // saldo final proyectado en cascada
}

export interface CashFlowProjection {
  currentBalance: number;      // disponible hoy, consolidado en soles
  weeks: ProjectionWeek[];     // 4, de la semana en curso
  unassigned: { collections: number; payments: number }; // crédito sin fecha (no suma)
  hasNegativeWeek: boolean;
  firstNegativeWeekIndex: number | null;
}

export interface ProjectionInput {
  today: string;
  currentBalance: number;
  receivables: VoucherBalance[]; // listOpenVouchers("INGRESO")
  payables: VoucherBalance[];    // listOpenVouchers("EGRESO")
}

export function buildCashFlowProjection(input: ProjectionInput): CashFlowProjection;

// components/cajas-bancos/cash-flow-projection.tsx — componente nuevo
// Carga sus datos (posiciones + cartera + TC) y renderiza la sección.
```

## Implementation plan

1. **`toPen` a lib**: mover la función a `lib/caja/dashboard.ts`, reutilizarla en `cuentas-view.tsx` (mismo comportamiento) y corregir los totales del `dashboard-view.tsx` (Disponible total / En cajas / En bancos / footer) con `getPenUsdRate`, incluida la nota cuando hay USD sin TC. Tests unitarios de `toPen` y ajuste de los existentes de `summarizePositions` si aplican.
2. **`lib/caja/proyeccion.ts`**: `startOfWeek` + `buildCashFlowProjection` puros, con tests unitarios (reparto por semanas, atrasados a la semana 1, sin fecha al apartado, cascada, semana negativa, 4 semanas exactas).
3. **`cash-flow-projection.tsx`**: carga (`listCashPositionsConsolidated` + `listOpenVouchers` ×2 + `getPenUsdRate`), tabla de 4 filas × 4 semanas, alerta rose con texto guía, notas de sin fecha y alcance, y "Descargar CSV". Tests de componente con mocks de las funciones de carga.
4. **Integración en el Resumen**: montar la sección entre "Cartera por cobrar" y "Desglose por cuenta" (con `id="flujo"`), y actualizar `QUICK_LINKS` ("Extractos" + ancla "Ver flujo de caja").
5. **Validación final**: `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build`. Sin migraciones ni advisors que tocar (no hay cambios de BD).

## Acceptance criteria

- [x] El Resumen muestra la sección "Flujo de caja proyectado" con 4 semanas (lunes a domingo, la primera es la semana en curso) y el encabezado "Disponible hoy: S/ X · N cuentas · TC S/ 3.75". Test de componente.
- [x] La tabla tiene las filas Atrasado, Cobranzas, Pagos y Queda; "Queda" se calcula en cascada desde el disponible de hoy. Tests del helper (cascada) y de la sección.
- [x] Los comprobantes vencidos (incluido el contado con saldo) suman en la semana 1 como "Atrasado", con el desglose "por cobrar +X · por pagar −Y" visible.
- [x] Los créditos sin fecha de vencimiento no suman: la nota al pie muestra su total y avisa que no está considerado. Test del helper y de la sección.
- [x] Una semana con "Queda" negativo se muestra en rose con el texto guía "No te alcanza esa semana. Cobra lo atrasado o aplaza el pago." Test del helper (primera semana negativa) y de la sección (texto con la fecha de la semana).
- [x] "Disponible total", "En cajas", "En bancos" y el footer del desglose del Resumen convierten las cuentas en USD con el TC configurado; sin TC, USD cuenta como 0 con nota visible. Test de `toPen` y de la sección (1,000 PEN + 100 USD × 3.75 = 1,375).
- [x] "Descargar CSV (se abre en Excel)" genera `flujo-proyectado-{hoy}.csv` con el encabezado y las 4 semanas. Test del nombre y contenido.
- [x] Los accesos rápidos del Resumen incluyen "Extractos" y el ancla "Ver flujo de caja" lleva a la sección (`#flujo`).
- [x] No hay cambios en la BD (sin migraciones), y `toPen`, `startOfWeek` y `buildCashFlowProjection` son funciones puras con tests unitarios.
- [x] `npx tsc --noEmit`, `npm run lint`, `npm test` (588 tests) y `npm run build` pasan en verde.

## Decisions

- **Sí:** sección dentro del Resumen. **No:** página propia con ítem de menú — el dueño ya visita el Resumen y el reporte es una lectura semanal, no una consulta puntual como el extracto.
- **Sí:** 4 semanas, de lunes a domingo, la primera es la en curso. **No:** 8 semanas (tabla pesada) ni columnas mensuales (pierde el detalle semanal que pide el procedimiento).
- **Sí:** los atrasados (y el contado pendiente) suman en la semana 1 como línea propia. **No:** excluirlos (la proyección diría "alcanza" ignorando dinero ya cobrable) ni esconderlos en una nota. Optimista pero transparente: el desglose siempre visible.
- **Sí:** el crédito sin fecha va en nota aparte sin sumar. **No:** repartirlo (no hay base para elegir semana) ni descartarlo en silencio.
- **Sí:** consolidar a soles con el TC de Configuración y corregir de paso el Resumen. **No:** dejar el bug (mostrar "S/ 1,500" mezclando PEN y USD es mentir) ni convertir solo la proyección.
- **Sí:** USD sin TC cuenta como 0 **con nota visible**. **No:** sumarlo como PEN (peor mentira) — el `toPen` existente ya devolvía 0; ahora al menos se avisa.
- **Sí:** rose solo para el "Queda" negativo. **No:** emerald para semanas positivas — un número proyectado no se celebra.
- **Sí:** "la proyección usa solo lo ya registrado" como nota al pie. **No:** simular cobertura de gastos futuros no registrados.
- **Sí:** helpers puros (`startOfWeek`, `buildCashFlowProjection`) en `lib/` con tests, y el componente carga sus propios datos. **No:** lógica de proyección dentro del componente ( quedaría intestable, como pasó con el arqueo del panel de caja chica).
- **Sí:** las semanas son lunes-domingo para lectura de negocio. **No:** reutilizar la semántica "WEEKLY → domingo terminal" de `periodo.ts` (esa es para cierres de caja, otro concepto).
- **Asumido:** los comprobantes están en soles — `voucher_balance` no expone moneda y el multi-moneda real quedó fuera de alcance desde SPEC 34/37; el TC solo aplica a las cuentas de caja/banco.
- **Pase previo por `frontend-design`** (2026-10-28): "la proyección responde una sola pregunta: ¿me alcanza?" — una tabla, tres conceptos (entra, sale, queda) y el atrasado con etiqueta propia; descartados el gráfico de barras (decorativo), el número gigante con gradiente y las tarjetas idénticas; montos con `tabular-nums`; cabeceras de semana con rango corto.
- **Corrección de implementación (2026-10-28):** lo que vence **después de la cuarta semana** se ignora en la proyección (el horizonte es de 4 semanas y no se inventa una columna extra); queda documentado en el helper. La nota de "sin fecha" muestra por cobrar y por pagar por separado.
- **Corrección de implementación (2026-10-28):** la fila "Atrasado" muestra el **neto** y debajo el desglose "+X por cobrar · −Y por pagar"; solo aplica a la semana 1 (las demás muestran "—").

## Risks

| Risk | Mitigation |
| --- | --- |
| Proyección optimista: asume que lo atrasado se cobra y que no hay gastos futuros no registrados | Desglose del atrasado siempre visible + nota "la proyección usa solo lo ya registrado" |
| `voucher_balance` no expone moneda de comprobante | Asumido soles (decisión documentada); el multi-moneda real sigue fuera de alcance |
| USD sin TC configurado cuenta como 0 | Nota visible que pide configurar el TC; el dato no desaparece en silencio |
| 4 consultas nuevas en el Resumen (posiciones ya cargadas + cartera ×2 + TC) | La sección carga en paralelo con su propio estado; el Resumen ya hacía `getCarteraResumen` similar |
| Semana negativa por un solo pago grande asusta | El texto guía indica la acción (cobrar atrasado o aplazar); la fila "Atrasado" recuerda que hay margen |
| Contado pendiente antiguo infla el "Atrasado" | Es correcto: es dinero ya cobrable; el desglose por cobrar / por pagar lo separa |
| Sin `id="flujo"` el ancla no funciona | Se define el id en la sección y se verifica en el test de componente del Resumen |

## What is **not** in this spec

Conciliación bancaria formal (SPEC 53); movimientos previstos manuales; aging de cartera; indicadores DSO o días de caja; multi-moneda real; gráficos del flujo; página propia del flujo; cambios en la BD de cualquier tipo. Cada uno, si llega, va en su propia spec.
