# SPEC 28 — Ordenamiento en datatables de caja/bancos, acciones de pago en el datatable y rediseño del Detalle de Cuentas

> **Estado:** Implementado
> **Depende de:** SPEC 26, SPEC 27
> **Fecha:** 2026-10-08
> **Objetivo:** Agregar ordenamiento por cabecera a los datatables de caja/bancos, mover los botones Imprimir y Anular del modal de detalle de pago al datatable como acciones con icono y tooltip, y enriquecer el Detalle de Cuentas con KPIs, búsqueda/filtro, columnas nuevas y márgenes correctos.

## Why this spec exists

El módulo de caja/bancos quedó con ordenamientos inconsistentes: el tab Cuentas de configuración ordena solo 3 de sus columnas, Métodos y Categorías tienen el feature de sorting activado pero sus cabeceras no son botones, y el Detalle de Cuentas, el historial de cierres y el reporte de cuadre no ordenan en absoluto. Además, el Detalle de Cuentas (`/cajas-bancos/cuentas`) no usa el `container mx-auto p-6` que sí usan sus vistas hermanas, por lo que el contenido queda pegado a los lados, y la página está visualmente vacía (una tarjeta y una tabla). En pagos, las acciones operativas (Imprimir, Anular) viven dentro del modal de detalle mientras el datatable solo ofrece "Ver"; el resto del proyecto (ventas, compras) ya expone las acciones como iconos con tooltip en la fila. Esta spec homogeneiza el ordenamiento, mueve esas acciones a la fila y da densidad útil al Detalle de Cuentas.

## Scope

**In:**

- Ordenamiento por clic en cabecera en **todas** las tablas de caja/bancos:
  - Detalle de Cuentas (`cuentas-view.tsx`): hoy sin sorting.
  - Historial de cierres (`cuadres-view.tsx` → `CashClosesTable`): hoy sin sorting.
  - Reporte de cuadre (`cuadre-report.tsx`): sus dos tablas (movimientos y totales por categoría), hoy sin sorting.
  - Tab Cuentas de configuración (`cash-accounts-columns.tsx`): completar las columnas que hoy no ordenan (Banco, Nro de cuenta, Moneda, Estado).
  - Tab Métodos de pago (`metodos-pago-columns.tsx`): hoy el feature está activo pero las cabeceras no son botones.
  - Tab Categorías (`categorias-columns.tsx`): ídem.
- Componente compartido `DataTableColumnHeader` en `components/shared/data-table-column-header.tsx` que replica el header ordenable actual (Button ghost + título + icono de orden) para no repetir el patrón en cada archivo.
- Pagos (ingresos **y** egresos): añadir al datatable (`payments-columns.tsx`) los iconos **Imprimir** y **Anular** junto a "Ver", con tooltip; **se eliminan** del footer del modal de detalle (`payment-detail-modal.tsx`) los botones "Imprimir recibo" y "Anular pago".
  - El icono Imprimir abre el `ReceiptDialog` ya existente.
  - El icono Anular abre el modal de detalle directamente en su modo "Anular" (reutiliza el textarea de motivo y "Confirmar anulación" existentes).
  - El icono Anular se oculta (o deshabilita) cuando el recibo está `ANULADO`.
- Detalle de Cuentas (`cuentas-view.tsx`):
  - Márgenes: envolver la vista en `container mx-auto … p-6`, igual que `cuadres-view.tsx` y `configuracion-view.tsx`.
  - KPIs resumen: nº de cuentas, saldo en cajas (equiv. PEN), saldo en bancos (equiv. PEN); se conserva la tarjeta "Total consolidado (PEN)".
  - Buscador (por nombre/banco) y filtro de tipo Todos/Caja/Banco por encima del datatable.
  - Columnas nuevas por cuenta: % del saldo total, saldo equivalente en PEN y fecha del último movimiento.
- Helper de lectura aditivo en `lib/caja/caja.ts` para la fecha del último movimiento de una cuenta.
- Actualizar los tests que rompan por los cambios de UI.

**Out of scope (for future specs):**

- Gráfico de distribución de saldo por cuenta (Opción no elegida).
- Acciones por cuenta dentro del Detalle de Cuentas (ver movimientos / editar); la edición sigue en el tab Cuentas de configuración.
- Cambios de BD, RLS o RPC; no se regenera `lib/supabase/types.ts` (sin cambios de esquema).
- Impresión nueva o rediseño del recibo.
- Corrección del doble padding del tab Cuentas de configuración (`configuracion-view.tsx` envuelve a `CajasBancosListadoView`, que a su vez trae su propio `<main container>`); se registra como deuda conocida, no se toca aquí.
- Orden o filtrado en servidor: todo sigue siendo local (client-side).

## Data model

No hay estructuras persistidas nuevas ni cambios de BD. Se extienden tipos de UI y se agrega un helper de lectura.

Componente compartido nuevo (`components/shared/data-table-column-header.tsx`):

```tsx
// Props (adáptense los genéricos a la API de TanStack Table v9 del repo)
interface DataTableColumnHeaderProps<TFeatures, TData> {
  column: Column<TFeatures, TData>;
  title: string;
  align?: "left" | "center" | "right"; // default "left"
  className?: string;
}
// Render equivalente al actual: <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>{title}<ArrowUpDown /></Button>
```

Acciones del datatable de pagos (`components/pagos/payments-columns.tsx`):

```ts
interface PaymentsColumnsActions {
  onView: (payment: Payment) => void;
  onPrint: (payment: Payment) => void;  // nuevo: abre ReceiptDialog
  onAnnul: (payment: Payment) => void;  // nuevo: abre el modal en modo "Anular"
  direction: PaymentDirection;
}
// Cada fila muestra: [Ver] [Imprimir] y [Anular] (Anular solo si status !== "ANULADO").
```

Modal de detalle (`payment-detail-modal.tsx`): nueva prop opcional `initialMode?: "view" | "annul"` (default `"view"`); se elimina la prop `onPrint` y el botón "Imprimir recibo" del footer. El tipo `DetailMode` ya existe (`"view" | "assign" | "annul"`).

Fila del Detalle de Cuentas (`cuentas-view.tsx`), extendida (derivada, no persistida):

```ts
interface AccountPositionRow {
  id: string;
  isBank: boolean;
  name: string;
  bankName: string;
  currency: string;
  closing: string;
  balance: number;           // nuevo: valor numérico crudo, para ordenar (no la etiqueta formateada)
  sharePercent: number;      // nuevo: % sobre el total consolidado (PEN)
  equivalentPen: number;     // nuevo: saldo convertido a PEN (con penUsdRate; 0/null si falta tasa)
  lastMovementDate: string | null; // nuevo: ISO del último payment de la cuenta, o null
  balanceLabel: string;      // se conserva para mostrar
}
```

Helper de lectura aditivo en `lib/caja/caja.ts`:

```ts
// Query de lectura: 1 fila, orden desc por payment_date, limit 1.
export async function getLastMovementDate(cashAccountId: string): Promise<string | null>;
```

Convenciones de ordenamiento:

- Las columnas numéricas (saldo, %, equivalente PEN) ordenan por el **valor numérico** (`accessor("balance")`), y la celda formatea; nunca ordenar el string de moneda.
- Las columnas booleanas/enum ordenan por su valor crudo (`isBank`, `currency`, `status`).
- El estado de sorting se controla con `useState<SortingState>` + `onSortingChange` + `state.sorting` en cada tabla (como `sales-data-table.tsx`), y las features incluyen `rowSortingFeature` + `createSortedRowModel()` + `sortFns`.

## Orquestación multiagente

| Fase | Depende de | Agente | Modelo | Archivos permitidos | Archivos prohibidos | Salida |
| --- | --- | --- | --- | --- | --- | --- |
| A | — | general (subagente) | `opencode-go/claude-haiku-5-5` (0.1/0.5) | `components/shared/data-table-column-header.tsx` (nuevo) | todo lo demás | Componente `DataTableColumnHeader` que compila y pasa lint |
| B1 | A | general (subagente) | `opencode-go/qwen3.8-flash` #medium (0.15/0.47) | `components/cajas-bancos/cash-accounts-columns.tsx`, `metodos-pago-columns.tsx`, `categorias-columns.tsx`, `cash-accounts-data-table.tsx`, `metodos-pago-card.tsx`, `categorias-data-table.tsx` | `cuentas-view.tsx`, `cuadres-view.tsx`, `cuadre-report.tsx`, `lib/caja/**`, `components/pagos/**` | Los 3 datatables de configuración ordenan por clic en cabecera |
| B2 | A | general (subagente) | `opencode-go/gpt-6-luna` (0.1/0.5) | `components/cajas-bancos/cuadres-view.tsx`, `cuadre-report.tsx` | `cuentas-view.tsx`, `cash-*`, `metodos-pago-*`, `categorias-*`, `lib/caja/**`, `components/pagos/**` | Historial de cierres y las 2 tablas del reporte ordenan |
| B3 | — | general (subagente) | `opencode-go/glm-5.3-flash` (0.15/0.5) | `components/pagos/payments-columns.tsx`, `payments-view.tsx`, `payment-detail-modal.tsx` | `components/cajas-bancos/**`, `lib/caja/**`, `lib/pagos/**` | Iconos Imprimir/Anular en el datatable; modal en modo Anular; footer del modal sin esos botones |
| C | A | general (subagente) | `opencode-go/deepseek-v4.1-flash` #high (0.15/0.6) | `components/cajas-bancos/cuentas-view.tsx`, `lib/caja/caja.ts` | `cash-*`, `metodos-pago-*`, `categorias-*`, `cuadres-view.tsx`, `cuadre-report.tsx`, `components/pagos/**` | Detalle de Cuentas con márgenes, KPIs, buscador/filtro, columnas nuevas y sorting |
| Z | A,B1,B2,B3,C | orquestador (sesión principal) | `opencode-go/gpt-6-luna` (0.1/0.5) | fixes en cualquier archivo ya existente | ninguna estructura nueva | lint+test+build verdes y verificación Playwright |

### Reglas de convivencia

- Traslape cero: cada archivo aparece en una sola unidad. `cuentas-view.tsx` vive únicamente en C (por eso su sorting y su rediseño van juntos, no separados).
- Ventana de ejecución: A primero (crea el componente que consumen B1, B2 y C). B3 no depende de A y puede correr en paralelo desde el inicio si hay cupo, pero para respetar el máximo de 3 simultáneos se ejecuta B1, B2 y B3 en la primera oleada, y C en la segunda (C es la unidad más pesada).
- Máximo 3 unidades simultáneas. Ninguna unidad hace commit; el commit se hace en rama `spec-28-...` desde la sesión principal tras la Fase Z.
- Prompts de subagentes autocontenidos: incluyen objetivo de la unidad, archivos permitidos/prohibidos, el contrato de `DataTableColumnHeader`, la convención de orden numérico y los criterios de aceptación relacionados.
- B1/B2/C no ejecutan `build` (evita compilar en simultáneo); solo `npm run lint` y los tests de su área. El build global lo corre Z.
- El componente de A debe mantener el look actual (Button ghost + `ArrowUpDown`); no se cambia el estilo visual de las cabeceras.

## Implementation plan

> Los pasos están agrupados por fase. B1, B2 y B3 corren en paralelo; C va después. La numeración refleja el orden temporal.

**Fase A (prerrequisito único):**

1. Crear `components/shared/data-table-column-header.tsx` con `DataTableColumnHeader` (Button ghost + título + icono de orden, con `align`); exportarlo. `npm run lint`. Prueba manual: usarlo temporalmente en una cabecera ya existente (p. ej. ventas) y verificar que ordena igual; revertir la prueba.

**Fase B (paralela):**

2. `B1 — Configuración de caja/bancos`: en `cash-accounts-columns.tsx`, cambiar las cabeceras de Banco, Nro de cuenta, Moneda y Estado a `DataTableColumnHeader`; en `metodos-pago-columns.tsx` y `categorias-columns.tsx`, convertir todas las cabeceras en `DataTableColumnHeader`. Verificar que `cash-accounts-data-table.tsx`, `metodos-pago-card.tsx` y `categorias-data-table.tsx` ya cablean `onSortingChange`/`state.sorting`; completarlo si falta. `npm run lint` + tests de componentes de esas tablas.
3. `B2 — Cierres y cuadre`: en `cuadres-view.tsx`, agregar `rowSortingFeature` + `createSortedRowModel()` + `sortFns` a `closesTableFeatures`, estado de sorting en `CashClosesTable` y cabeceras con `DataTableColumnHeader`. En `cuadre-report.tsx`, ídem para `reportTableFeatures` en sus dos tablas (movimientos y totales por categoría; cada una con su estado de sorting). `npm run lint` + tests afectados.
4. `B3 — Acciones de pago en el datatable`: en `payments-columns.tsx`, añadir `onPrint` y `onAnnul` a las acciones y renderizar los iconos `Printer` y `Ban` (o `CircleSlash`) con `Tooltip` (Anular oculto si `status === "ANULADO"`). En `payments-view.tsx`, cablear `onPrint` (setea `printingPaymentId`) y `onAnnul` (abre el modal con `initialMode="annul"`). En `payment-detail-modal.tsx`, agregar `initialMode`, eliminar la prop `onPrint`, el botón "Imprimir recibo" y el botón "Anular pago" del footer; conservar los modos "assign"/"annul" del cuerpo. `npm run lint`.

**Fase C (después de B):**

5. `C — Detalle de Cuentas`: en `cuentas-view.tsx`, cambiar el contenedor a `<main className="container mx-auto flex flex-col gap-6 p-6">`; agregar `rowSortingFeature` + `createSortedRowModel()` + `sortFns` a `cuentasTableFeatures` y estado de sorting; agregar la tarjeta de KPIs (nº cuentas, cajas PEN, bancos PEN); añadir el `Input` de búsqueda y el `Select` de tipo encima del datatable; extender `AccountPositionRow` con `balance`, `sharePercent`, `equivalentPen`, `lastMovementDate` y agregar sus columnas (ordenables por valor numérico).
6. `C (cont.)`: agregar `getLastMovementDate(cashAccountId)` a `lib/caja/caja.ts` (query de lectura: `payment` por `cash_account_id`, orden `payment_date` desc, `limit(1)`) y consumirlo en `listCashPositions` o en la vista con `Promise.all` para poblar `lastMovementDate`. `npm run lint` + tests de componentes de cuentas.

**Fase Z (integración; orquestador en sesión principal):**

7. `npm run lint` + `npm test` + `npm run build`; corregir lo que rompa (incluidos tests de componente que asserten los botones retirados del modal de pagos).
8. Verificación con navegador (Playwright): `/cajas-bancos/cuentas` (márgenes, KPIs, buscador, filtro de tipo, sorting y columnas nuevas), `/cajas-bancos/cuadres` (sorting en cierres y reporte), `/cajas-bancos/configuracion` (3 tabs ordenan), `/pagos/ingresos` y `/pagos/egresos` (iconos Imprimir/Anular con tooltip; Anular abre el modal en modo Anular y confirma; el footer del modal ya no muestra esos botones). Cap de 2 rondas de fixes.

## Acceptance criteria

- [x] En Detalle de Cuentas, historial de cierres y las dos tablas del reporte de cuadre, hacer clic en la cabecera ordena y alterna asc/desc con el icono reflejando el estado.
- [x] En el tab Cuentas de configuración, las columnas Banco, Nro de cuenta, Moneda y Estado también ordenan.
- [x] Los datatables de Métodos de pago y Categorías ordenan al hacer clic en sus cabeceras.
- [x] Las columnas numéricas (saldo, % del total, equivalente PEN) ordenan por su valor numérico, no alfabéticamente por el texto formateado.
- [x] El Detalle de Cuentas usa el mismo contenedor/márgenes que las demás vistas de caja y bancos (no queda pegado a los lados).
- [x] El Detalle de Cuentas muestra las tarjetas KPI: nº de cuentas, saldo en cajas (equiv. PEN) y saldo en bancos (equiv. PEN), además del total consolidado.
- [x] El buscador filtra por nombre o banco y el filtro de tipo (Todos/Caja/Banco) filtra el datatable.
- [x] El Detalle de Cuentas muestra las columnas % del saldo total, equivalente en PEN y último movimiento; una cuenta sin pagos muestra "—" en último movimiento.
- [x] El datatable de pagos (ingresos y egresos) muestra los iconos Imprimir y Anular junto a Ver, cada uno con tooltip.
- [x] El icono Imprimir abre el recibo del pago; en un recibo `ANULADO` el icono Anular no está disponible.
- [x] El icono Anular abre el modal de detalle en modo "Anular" (con textarea de motivo y "Confirmar anulación"); confirmar anula el pago y refresca la fila.
- [x] El footer del modal de detalle de pago ya no muestra "Imprimir recibo" ni "Anular pago"; conserva "Asignar saldo" (si aplica) y "Cerrar".
- [x] `npm run lint`, `npm test` y `npm run build` pasan sin errores.

## Decisions

- **Sí:** mover (no duplicar) Imprimir y Anular del footer del modal al datatable, como iconos con tooltip — elección del usuario.
- **Sí:** el icono Anular abre el modal en modo "Anular" reutilizando el textarea de motivo existente — elección del usuario.
- **Sí:** ordenamiento en todas las tablas de caja/bancos — elección del usuario.
- **Sí:** extraer `DataTableColumnHeader` compartido en lugar de repetir el patrón inline en 6+ archivos; es además el prerrequisito real de la Fase A.
- **Sí:** Detalle de Cuentas con KPIs + buscador/filtro + columnas nuevas y márgenes `container mx-auto p-6` — elección del usuario.
- **Sí:** preservar el look actual de las cabeceras (Button ghost + `ArrowUpDown`); el componente es un refactor de extracción, no un rediseño.
- **Sí:** `lastMovementDate` vía helper de lectura aditivo en `lib/caja/caja.ts` (una query `limit(1)` por cuenta, en paralelo).
- **No:** gráfico de distribución de saldo por cuenta (no elegido).
- **No:** acciones por cuenta en el Detalle de Cuentas (no elegido).
- **No:** cambios de BD/RLS/RPC ni regeneración de tipos.
- **No:** orden/filtrado en servidor.
- **Presupuesto:** Económico en **todas** las fases (elección del usuario, revisada al inicio de la implementación). Modelos: A `claude-haiku-5-5`; B1 `qwen3.8-flash`; B2 `gpt-6-luna`; B3 `glm-5.3-flash`; C `deepseek-v4.1-flash #high`; Z `gpt-6-luna`.

## Risks

| Riesgo | Mitigación |
| --- | --- |
| Ordenar columnas de moneda por su etiqueta formateada da un orden incorrecto | Se define un accessor numérico (`balance`, `sharePercent`, `equivalentPen`) para ordenar y la celda formatea el valor |
| `lastMovementDate` implica N consultas (una por cuenta) | Query `limit(1)` ordenada desc por cuenta, ejecutada en `Promise.all`; una cuenta sin pagos devuelve `null` → "—" |
| El modal de pagos abierto en modo "Anular" antes de cargar el detalle | El modo se aplica tras el `loadDetail`; mientras carga se muestra el skeleton ya existente |
| Tests de componente que asserten "Imprimir recibo"/"Anular pago" en el modal | Se localizan y actualizan en la Fase Z (o en la unidad que toque el modal); `npm test` en verde |
| El tipado genérico de `Column` en la API v9 de TanStack Table puede dificultar el componente compartido | Encapsular con genéricos mínimos o un `any` acotado y documentado; validar con `lint` + `build` en A/Z |
| B1/B2 y C comparten dominio caja/bancos y podrían pisarse en el estado de sorting | Reparto por archivos explícito (traslape cero); A precede a B/C y Z valida el conjunto |
| Quitar los botones del footer cambia el flujo de anulación que ya funcionaba | El modo "annul" del cuerpo del modal es el mismo que hoy; solo cambia el disparador (de footer a icono del datatable) |

## What is **not** in this spec

- Gráfico de distribución de saldo por cuenta.
- Acciones por cuenta dentro del Detalle de Cuentas (ver movimientos / editar).
- Cambios de BD, RLS, RPC o regeneración de `lib/supabase/types.ts`.
- Rediseño del recibo imprimible.
- Corrección del doble padding del tab Cuentas de configuración.
- Orden, filtrado o paginación en el servidor.

Cada uno de esos, si aterriza, va en su propia spec.
