# SPEC 15 — Calidad: tests de pagos/saldos, fin del log silencioso y tipos regenerados

> **Status:** Implementado
> **Depends on:** SPEC 09, SPEC 13, SPEC 14
> **Date:** 2026-10-01
> **Objective:** Cubrir con tests automatizados los caminos críticos de pagos transaccionales y saldos, eliminar la degradación silenciosa de balances por `console.error`, y regenerar `lib/supabase/types.ts` desde el CLI de Supabase para evitar desincronización futura.

## Why this spec exists

La auditoría del 2026-10-01 identificó tres brechas de calidad que cualquier spec futura (16+) va a amplificar si no se cierran antes: (1) cero cobertura de tests sobre la lógica contable — pagos transaccionales (`create_payment_with_allocations`), cálculo de saldos (`voucher_balance`) y mappers de comprobantes —, (2) dos `console.error` huérfanos en `lib/comprobantes/comprobantes.ts:105` y `lib/comprobantes/compras.ts:106` que silencian fallos del join de balances y devuelven `balance: 0` sin avisar a la UI, y (3) `lib/supabase/types.ts` (484 líneas) mantenido a mano, en riesgo de divergir del esquema real cuando SPEC 16+ sume columnas. Esta spec ataca exactamente esos tres puntos sin tocar UX ni RSC; deja CI, `proxy.ts` y la auditoría RLS para SPEC 16/17.

## Scope

**In:**

- Instalación y configuración de **Vitest** + `@testing-library/react` + `jsdom` para tests unitarios y de componentes.
- Instalación y configuración de **Playwright** (`@playwright/test`) en modo Test (no solo MCP) para un test e2e del flujo crítico "Registrar pago → ver saldo actualizado → ver historial".
- **Sin umbral de cobertura** (decisión del usuario): se cubren los caminos críticos de `lib/pagos/`, `lib/comprobantes/` y los mappers, sin `fail-under` que rompa el build.
- Tests unitarios en `tests/unit/` para:
  - `lib/pagos/saldos.ts` — `isOverdue`, cálculos de vencido.
  - `lib/pagos/cartera.ts` — `getCarteraResumen`, `listOpenVouchers`, `listUnassignedPayments` (con `supabase` mockeado).
  - `lib/pagos/pagos.ts` — `mapPaymentHistoryRow`, `createPayment`, `annulPayment` (RPC mockeada).
  - `lib/comprobantes/comprobantes.ts` — `mapComprobanteRow`, `mapBalanceRow`, `listSales`, `listPurchases` (caminos éxito, balances vacíos, fallo de balances).
  - `lib/comprobantes/compras.ts` — espejo del anterior para EGRESO.
  - `lib/schemas/*.ts` — `client`, `sale`, `purchase`, `payment` (validación con Zod).
- Tests de componente en `tests/components/` para:
  - `PaymentHistorySection` (loading / empty / error / populated).
  - `PaymentStatusBadge` (REGISTRADO verde, ANULADO gris).
  - `DataTablePagination` (avance/retroceso de página con datos sintéticos).
- **Un test e2e crítico** en `tests/e2e/registrar-pago-y-ver-saldo.spec.ts` que:
  - Abre `/ventas/listado`, hace clic en una fila para abrir el modal de detalle.
  - Hace clic en "Registrar pago", completa el formulario con un monto parcial.
  - Confirma el modal y verifica que el data table ahora muestra `Pagado: <monto>` y `Saldo: <restante>`.
  - Abre el modal de detalle otra vez y verifica que la sección "Historial de pagos" contiene la nueva fila.
- **Eliminación del `console.error` silencioso**: refactor de `listSales` y `listPurchases` en `lib/comprobantes/comprobantes.ts` y `lib/comprobantes/compras.ts` para que propaguen el error tipado en lugar de loguearlo y devolver `balance: 0`. Los callers (`sales-data-table.tsx`, `purchases-data-table.tsx`, los `*-provider.tsx`) deben mostrar `toast.error` cuando la consulta del balance falla, con mensaje en español ("No se pudieron cargar los saldos. Reintenta.").
- **Regeneración de `lib/supabase/types.ts`** desde el CLI de Supabase:
  - Nuevo `npm script` `gen:types` que ejecute `supabase gen types typescript --linked > lib/supabase/types.ts`.
  - Documentación breve en el header de `lib/supabase/types.ts` que indique que el archivo es **generado** y no se edita a mano, y cómo regenerarlo.
  - Verificación post-regeneración: `npm run lint` y `npm run build` siguen pasando. Si la regeneración trae diferencias, commit aparte para revisarlas (no en este spec salvo diff trivial).
- Configuración de **CI mínima local**: scripts npm agregados (`test`, `test:unit`, `test:components`, `test:e2e`, `test:coverage`) y ejecución manual documentada en el README/AGENTS.md. **No se crea GitHub Actions** en esta spec (queda para SPEC 16).
- Verificación final: `npm run lint`, `npm run build`, `npm test`, `npm run test:e2e` (con el server de Next levantado) pasan localmente.

**Out of scope (for future specs):**

- GitHub Actions u otra CI remota (SPEC 16).
- `proxy.ts` de Next 16 (SPEC 16).
- Auditoría de RLS / advisors de Supabase (SPEC 17).
- Refactor a Server Components / `cache()` de los listados (SPEC 16).
- Migrar listados a SSR / eliminar `"use client"` masivo.
- Tests visuales / snapshot de componentes UI más allá de los tres críticos enumerados.
- Tests de carga o performance.
- Cobertura de formularios extensos (`sale-form.tsx`, `purchase-form.tsx`, `payment-form.tsx`) más allá de la validación Zod de sus schemas.
- Cambiar el modelo de datos, vistas, RPCs o triggers.
- Anular `create_payment_with_allocations` y reescribirla: los tests verifican el contrato actual.

## Data model

No se crean tablas, vistas, columnas, RPCs ni migraciones. Esta spec opera exclusivamente sobre el código existente.

Nuevos archivos (todos generados, no editables a mano):

```text
vitest.config.ts
vitest.setup.ts          # carga @testing-library/jest-dom
playwright.config.ts     # apunta a npm run dev en :3000
tests/unit/lib/pagos/saldos.test.ts
tests/unit/lib/pagos/cartera.test.ts
tests/unit/lib/pagos/pagos.test.ts
tests/unit/lib/comprobantes/comprobantes.test.ts
tests/unit/lib/comprobantes/compras.test.ts
tests/unit/lib/schemas/client.test.ts
tests/unit/lib/schemas/sale.test.ts
tests/unit/lib/schemas/purchase.test.ts
tests/unit/lib/schemas/payment.test.ts
tests/unit/lib/pagos/mapPaymentHistoryRow.test.ts
tests/components/payment-history-section.test.tsx
tests/components/payment-status-badge.test.tsx
tests/components/data-table-pagination.test.tsx
tests/e2e/registrar-pago-y-ver-saldo.spec.ts
tests/__mocks__/supabase.ts   # cliente mock reutilizable para tests unitarios
```

Archivos modificados:

- `package.json` — agregar `scripts` (`test`, `test:unit`, `test:components`, `test:e2e`, `test:coverage`, `gen:types`) y `devDependencies` (`vitest`, `@vitest/coverage-v8`, `@vitejs/plugin-react`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, `jsdom`, `@playwright/test`).
- `lib/comprobantes/comprobantes.ts` — refactor de `listSales`: propaga el error del join de balances (cambia firma a retornar `{ sales, balanceError }` o lanza un error tipado `BalanceLoadError`); elimina el `console.error`.
- `lib/comprobantes/compras.ts` — mismo refactor para `listPurchases`.
- `components/ventas/sales-data-table.tsx` y `components/compras/purchases-data-table.tsx` — capturan el nuevo error tipado y emiten `toast.error` en español.
- `components/ventas/ventas-provider.tsx` y `components/compras/compras-provider.tsx` — capturan el error tipado en `refresh`/`loadSales`/`loadPurchases` y lo propagan a un nuevo campo del context (`balanceError`) que la UI ya consume.
- `components/ui/sidebar.tsx` — sin cambios.
- `lib/supabase/types.ts` — solo header nuevo (`// GENERATED — NO EDITAR — npm run gen:types`) en la primera línea. Si la regeneración produce diffs no triviales, se commitean en PR aparte; en esta spec se commitea solo si el diff es cosmético o vacío.
- `lib/supabase/client.ts` — sin cambios.
- `AGENTS.md` — agregar sección breve "Tests" con comandos disponibles y nota sobre cómo correr los e2e (requiere `npm run dev` en otra terminal).

Refactor de firma (propuesta, no definitiva — el implementador puede ajustar):

```ts
// lib/comprobantes/comprobantes.ts
export class BalanceLoadError extends Error {
  constructor(
    public readonly source: "balance" | "payment_balance",
    public readonly cause: unknown
  ) {
    super("No se pudo cargar el saldo de los comprobantes.");
    this.name = "BalanceLoadError";
  }
}

export interface SaleListResult {
  sales: Sale[];
  // si balanceError !== null, los sales igual vienen pero con balance=0; la UI avisa.
  balanceError: BalanceLoadError | null;
}

export async function listSales(): Promise<SaleListResult> { /* ... */ }

// espejo en lib/comprobantes/compras.ts para Purchase
```

Componente `PaymentHistorySection` (referencia al contrato actual, sin cambios funcionales):

```tsx
interface PaymentHistorySectionProps {
  comprobanteId: string;
  direction: PaymentDirection;
  onPrint: (paymentId: string) => void;
}
// Estados a cubrir en tests: isLoading=true, entries=[], entries=[entrada1, entrada2], error no nulo.
```

`tests/__mocks__/supabase.ts` (referencia, contrato del mock):

```ts
// Helpers: createMockSupabase({ balancesResult?: { data: [], error: null }, ... })
// Devuelve un objeto con la misma forma mínima que el cliente real: from(), rpc() chainable.
// Solo se usan métodos invocados por lib/ actual (from().select(), rpc().then()).
```

Convenciones:

- Tests unitarios: `*.test.ts` en `tests/unit/` espejo de `lib/`.
- Tests de componente: `*.test.tsx` en `tests/components/`.
- Tests e2e: `*.spec.ts` en `tests/e2e/`.
- Idiomas: descripciones de tests en inglés (`describe("mapComprobanteRow", …)`); mensajes de error de UI en español ("No se pudieron cargar los saldos. Reintenta.").
- Mocking: para tests unitarios se mockea `lib/supabase/client.ts` completo con `vi.mock(...)`. Para tests e2e no se mockea nada, se corre contra Supabase real con datos de seed.
- Datos de seed del e2e: un cliente y una venta pre-existentes con saldo > 0; documentados en el spec del test, no se crean acá.

## Implementation plan

1. Instalar dependencias de testing: `npm install -D vitest @vitest/coverage-v8 @vitejs/plugin-react @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom @playwright/test`. Verificar `npm run lint` sigue pasando.
2. Crear `vitest.config.ts` (config base, `jsdom`, `setupFiles: ['./vitest.setup.ts']`, alias `@/` igual a `tsconfig.json`), `vitest.setup.ts` (importa `@testing-library/jest-dom`), y `playwright.config.ts` (`baseURL: http://localhost:3000`, `webServer` que arranque `npm run dev` con `reuseExistingServer: true`). Verificar `npm run lint`.
3. Agregar scripts a `package.json`:
   - `"test": "vitest run"`
   - `"test:watch": "vitest"`
   - `"test:unit": "vitest run tests/unit"`
   - `"test:components": "vitest run tests/components"`
   - `"test:e2e": "playwright test"`
   - `"test:coverage": "vitest run --coverage"`
   - `"gen:types": "supabase gen types typescript --linked > lib/supabase/types.ts"`
4. Crear `tests/__mocks__/supabase.ts` con `createMockSupabase` que cubre los métodos usados por `lib/`. Sin tests todavía, solo el helper. Verificar `npm run lint`.
5. Tests unitarios del módulo `lib/pagos/saldos.ts` (cálculos puros, sin mock). Cubrir: `isOverdue` con fecha pasada/futura/hoy/balance cero. Verificar `npm test`.
6. Tests unitarios de `lib/pagos/cartera.ts` y `lib/pagos/pagos.ts` con `createMockSupabase`. Cubrir: casos éxito, casos `balancesResult.error` (que ahora propaga), casos `rpc().error`. Verificar `npm test`.
7. Tests unitarios de `lib/comprobantes/comprobantes.ts` y `compras.ts`: con y sin balances; con balances vacíos; con balances fallidos (verifica que retorna `balanceError` en lugar de tragar). Verificar `npm test`.
8. Tests unitarios de `lib/schemas/*.ts` (Zod): un caso válido y un caso inválido por schema. Verificar `npm test`.
9. Tests de componente (`tests/components/`): `PaymentHistorySection` con render de los 4 estados; `PaymentStatusBadge` con REGISTRADO/ANULADO; `DataTablePagination` con datos sintéticos. Verificar `npm test`.
10. Refactor de `lib/comprobantes/comprobantes.ts` y `compras.ts` para introducir `BalanceLoadError` + nueva firma `listSales()` / `listPurchases()`. Actualizar callers (`ventas-provider.tsx`, `compras-provider.tsx`, `sales-data-table.tsx`, `purchases-data-table.tsx`) para propagar y mostrar `toast.error` cuando `balanceError !== null`. Verificar `npm test`, `npm run lint`, `npm run build`.
11. Crear `tests/e2e/registrar-pago-y-ver-saldo.spec.ts` con el flujo "abrir venta → registrar pago → ver saldo actualizado → ver historial". Documentar el seed necesario en el comentario inicial del test (cliente + comprobante con saldo > 0). Levantar `npm run dev` en otra terminal, correr `npm run test:e2e`, verificar que pasa.
12. Regenerar `lib/supabase/types.ts` con `npm run gen:types`. Si el diff es trivial o vacío, commitear. Si el diff es no trivial, abrir PR aparte para revisar y dejar esta spec solo con el header "GENERATED" agregado manualmente. Verificar `npm run lint`, `npm run build`, `npm test`.
13. Actualizar `AGENTS.md` con la sección "Tests": comandos disponibles, cómo correr e2e (requiere dev server), nota sobre `npm run gen:types` para regenerar tipos.
14. Verificación final: `npm run lint`, `npm run build`, `npm test`, `npm run test:coverage` (revisión manual de %), `npm run test:e2e` (con dev server levantado) — todo pasa.

## Acceptance criteria

- [ ] `vitest.config.ts` y `playwright.config.ts` existen en la raíz del repo y usan los alias de `tsconfig.json` para `@/`.
- [ ] `package.json` tiene los scripts `test`, `test:unit`, `test:components`, `test:e2e`, `test:coverage` y `gen:types`, y todas las devDependencies del paso 1 del plan.
- [ ] `npm test` corre todos los tests unitarios y de componentes y termina en verde.
- [ ] `tests/unit/lib/pagos/saldos.test.ts` cubre `isOverdue` con al menos 4 casos (vencido, hoy, futuro, balance cero).
- [ ] `tests/unit/lib/comprobantes/comprobantes.test.ts` cubre: `listSales` con balances ok, con balances vacíos, con balances que devuelven error (verifica que retorna `BalanceLoadError` y NO silencia).
- [ ] `tests/unit/lib/comprobantes/compras.test.ts` cubre el espejo de EGRESO con el mismo set de casos.
- [ ] `lib/comprobantes/comprobantes.ts` y `lib/comprobantes/compras.ts` ya **no contienen `console.error`** (grep lo confirma).
- [ ] `listSales()` y `listPurchases()` retornan `{ sales|purchases, balanceError }` con `balanceError: BalanceLoadError` cuando el join de balances falla.
- [ ] Cuando el provider recibe `balanceError`, el data table de ventas/compras emite `toast.error("No se pudieron cargar los saldos. Reintenta.")`.
- [ ] `tests/components/payment-history-section.test.tsx` cubre los 4 estados: loading (Skeleton), empty (mensaje "Aún no se han registrado pagos…"), error (mensaje en sección + spy en toast), populated (fila con botón Imprimir que dispara `onPrint`).
- [ ] `tests/components/payment-status-badge.test.tsx` cubre REGISTRADO (variante verde) y ANULADO (`text-muted-foreground`).
- [ ] `tests/e2e/registrar-pago-y-ver-saldo.spec.ts` corre contra `npm run dev` y verifica: modal de detalle → registrar pago parcial → data table muestra `Pagado` y `Saldo` actualizados → modal muestra nueva fila en historial.
- [ ] `npm run gen:types` existe y, ejecutado, regenera `lib/supabase/types.ts` desde el CLI de Supabase.
- [ ] `lib/supabase/types.ts` tiene en su primera línea `// GENERATED — NO EDITAR — npm run gen:types`.
- [ ] Si la regeneración produjo un diff no trivial, ese diff va en un PR aparte (no en esta spec). Si fue trivial o vacío, se commitea en esta spec.
- [ ] `AGENTS.md` documenta los comandos de test y la nota sobre `npm run gen:types`.
- [ ] `npm run lint`, `npm run build` y `npm test` pasan al cerrar la spec.

## Decisions

- **Sí:** Vitest + Testing Library + Playwright Test. Cubre lógica rápida (`lib/`), componentes y un e2e crítico sin sobrecargar el repo.
- **Sí:** la firma de `listSales` / `listPurchases` cambia a `{ sales, balanceError }` en lugar de lanzar. Decisión pragmática: si los comprobantes cargaron bien pero los balances no, devolver los comprobantes con `balanceError` y que la UI avise es preferible a tirar todo el listado.
- **Sí:** el error tipado `BalanceLoadError` se define en `lib/comprobantes/comprobantes.ts` y se reexporta desde `lib/comprobantes/compras.ts` (o viceversa) para evitar duplicación.
- **Sí:** el toast vive en el data table (donde el usuario ve los saldos), no en el provider (donde el usuario no ve nada todavía).
- **Sí:** el `BalanceLoadError` se loguea en consola vía `console.error` en el provider, no en la capa `lib/`. La capa de datos **solo propaga**.
- **Sí:** tests unitarios de `lib/schemas/*.ts` con un caso válido + uno inválido por schema; suficiente para anclar la validación Zod, sin pretender cubrir todos los branches.
- **Sí:** `gen:types` corre **manualmente** en esta spec; CI queda pendiente. La desincronización se cierra parcialmente pero la automatización completa llega con SPEC 16.
- **Sí:** el header `// GENERATED — NO EDITAR` se agrega manualmente al inicio del archivo en esta spec, sin esperar a regenerar.
- **Sí:** el test e2e usa datos de seed pre-existentes; esta spec documenta qué seed necesita pero no lo crea (queda fuera de alcance; ya hay datos de desarrollo).
- **No:** umbral de cobertura `fail-under`. El usuario prefiere métrica informativa.
- **No:** GitHub Actions. SPEC 16 lo trae.
- **No:** `proxy.ts` ni middleware de Supabase SSR. SPEC 16.
- **No:** auditoría RLS con advisors. SPEC 17.
- **No:** refactor a Server Components ni `cache()`. SPEC 16.
- **No:** tests visuales / snapshot.
- **No:** tests de carga.
- **No:** reescritura de `create_payment_with_allocations` ni de las vistas. Solo se verifica su contrato vía mock.
- **No:** crear un seed script automatizado para el e2e. El usuario decide cómo poblar la DB de desarrollo.

## Risks

| Riesgo | Mitigación |
| --- | --- |
| La regeneración de tipos trae diff no trivial que rompe `npm run build` | Si el diff es > 50 líneas o toca tipos estructurales, se aísla en PR aparte; esta spec solo agrega el header "GENERATED". |
| El mock de Supabase no cubre un método nuevo y los tests fallan | El helper `createMockSupabase` se construye iterativamente junto con los primeros tests; los métodos se agregan a demanda. |
| El test e2e es flaky por datos de seed cambiantes | El test usa un comprobante específico (ID fijo) que el seed crea y deja en estado conocido; se documenta en el comentario inicial del spec. Si la práctica muestra flakiness, se reemplaza por un test de integración con DB de test. |
| `@testing-library/react` + RSC no rinden algunos componentes | Los componentes a testear (`PaymentHistorySection`, `PaymentStatusBadge`, `DataTablePagination`) son client components puros; `render(<Component {...props} />)` debería bastar. Si un componente no rendea, se ajusta el test, no se refactoriza el componente. |
| Romper el orden de Providers al importar tests | Los tests unitarios de `lib/` no importan providers; los de componentes renderizan aisladamente con `render`. Si un test requiere provider, se monta localmente en el test. |
| Cambiar la firma de `listSales`/`listPurchases` rompe SPEC 13 o SPEC 14 | SPEC 13/14 solo consumen los datos ya formateados; el cambio de firma se propaga a `ventas-provider.tsx`, `compras-provider.tsx`, `sales-data-table.tsx` y `purchases-data-table.tsx`. SPEC 14 (modal de detalle) usa `getPaymentHistory` y `getComprobante`, no toca. |
| Tests e2e lentos en CI futura | Aceptable; un solo e2e no impacta performance material. SPEC 16 puede agregar paralelización si agrega más e2e. |
| `supabase gen types` requiere `supabase` CLI y login | Documentado en AGENTS.md; el script falla con mensaje claro si la CLI no está instalada o no hay sesión. |

## What is **not** in this spec

- GitHub Actions u otra CI remota.
- `proxy.ts` ni middleware de Supabase SSR.
- Auditoría de RLS / advisors de Supabase.
- Refactor a Server Components / `cache()`.
- Migrar listados a SSR.
- Tests visuales / snapshot.
- Tests de carga o performance.
- Cobertura de los formularios extensos (`sale-form.tsx`, `purchase-form.tsx`, `payment-form.tsx`) más allá de la validación Zod de sus schemas.
- Cambios al modelo de datos, vistas, RPCs o triggers.
- Seed automatizado para tests e2e.

Cada uno de esos, si aparece, va en su propia spec.
