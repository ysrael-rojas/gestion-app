# SPEC 13 — Saldos "Pagado"/"Saldo" en data tables y pagos transaccionales

> **Status:** Implementado
> **Depends on:** SPEC 07, SPEC 08, SPEC 09, SPEC 12
> **Date:** 2026-09-30
> **Objective:** Sustituir las columnas "Días de crédito" y "F. vencimiento" del data table de ventas y compras por las columnas "Pagado" y "Saldo" derivadas de la vista `voucher_balance`, y garantizar que el alta de un pago con asignaciones sea atómica vía RPC para que un fallo a medio camino no deje asignaciones parciales.

## Why this spec exists

Hoy `/ventas/listado` y `/compras/listado` muestran el estado de pago como un badge PAGADO/PENDIENTE pero no exponen el importe abonado ni el saldo vivo. Mientras se registran pagos sobre una misma factura, el usuario no ve cómo baja la deuda — solo ve un badge que salta de PENDIENTE a PAGADO al cruzar el total. Además, `createPayment` (SPEC 09) hace dos inserciones separadas (`payment` + `payment_allocation`) sin una sola transacción: si el segundo insert falla, queda un pago huérfano con todas las asignaciones perdidas (riesgo explícito en SPEC 09). Esta spec ataca los dos frentes: enriquecer las tablas con cifras vivas para que el usuario vea el progreso tras cada abono, y prometer atomicidad real en el alta del pago.

## Scope

**In:**

- Migración `add_create_payment_with_allocations_rpc` con la función `public.create_payment_with_allocations(...)` (security definer, search_path vacío) que en una sola transacción Postgres inserta el `payment`, delega en el trigger existente la asignación de `receipt_number`, inserta las `payment_allocation` (validando saldo bloqueando el comprobante con `for update`) y deja que los triggers `refresh_comprobante_status`/`payment_status_refresh` actualicen el estado.
- Grant `execute` sobre la RPC a `anon` y `authenticated`.
- Regeneración de tipos en `lib/supabase/types.ts` para que la nueva función quede tipada.
- Refactor de `lib/pagos/pagos.ts`: `createPayment` deja de hacer dos inserciones y pasa a llamar `supabase.rpc('create_payment_with_allocations', ...)`; el resultado se devuelve usando el `paymentId` retornado por la RPC y luego `getPaymentDetail` para mantener la forma `PaymentDetail`.
- `createPayment` mantiene la firma externa `Promise<PaymentDetail>`. `mapError` se amplía para mapear errores de la RPC (`40001` serialización, `42883` función inexistente, mensajes del validador).
- `listSales` y `listPurchases` consultan `voucher_balance` en paralelo y enriquecen cada fila con `paidAmount` y `balance`. La fusión se hace por `comprobante_id` en un `Map`.
- `components/ventas/types.ts` y `components/compras/types.ts` añaden los campos `paidAmount: number` y `balance: number` a `Sale`/`Purchase`.
- `components/ventas/sales-columns.tsx`: se eliminan las columnas `creditDays` y `dueDate` y se añaden, en ese mismo orden, las columnas `paidAmount` ("Pagado") y `balance` ("Saldo"). Ambas con header y celdas alineados a la derecha, formato `formatCurrency`; la celda de `balance` usa `text-muted-foreground` cuando vale `0` y `font-medium` cuando es `> 0`.
- `components/compras/purchases-columns.tsx`: mismos cambios en la posición donde hoy están `creditDays` y `dueDate`.
- `PagosProvider.addPayment`/`assignAllocations`/`annulPayment` refrescan ventas y compras además de la lista de pagos, para que el data table origen refleje el nuevo saldo sin recargar.
- Reordenar los providers en `app/layout.tsx` (`Clientes → Ventas → Compras → Pagos → children`) para que `PagosProvider` quede dentro de `VentasProvider`/`ComprasProvider` y pueda invocar sus `refresh()`; hoy `PagosProvider` está por encima y los hooks lanzarían.

**Out of scope (for future specs):**

- Quitar los campos `creditDays`/`dueDate` del formulario de venta/compra o del modal de detalle: siguen siendo parte de la cabecera del comprobante y se siguen mostrando en el `DetailField`.
- Eliminar la columna `status` ni el badge `Estado pago` del data table, ni el filtro `Estado pago:` del `ListingsToolbar` (SPEC 11/12 los definieron y son complementarios al saldo numérico).
- Mostrar `Pagado`/`Saldo` en el modal de detalle de venta/compra (solo se piden en el data table).
- Materializar `paid_amount`/`balance` como columnas reales en `comprobante` (la fuente sigue siendo la vista `voucher_balance`).
- Crear un RPC para `addAllocations` (re-asignar saldo de un pago existente sigue yendo por el flujo actual de la SPEC 09; si más adelante hace falta atomicidad adicional se cubre en otra spec).
- Crear un RPC que combine alta de comprobante + pago inicial.
- Cuotas, cronogramas, vencimientos parciales automáticos ni alertas de mora adicionales a SPEC 10.
- Cambiar `payment_void_check`, los triggers existentes ni la lógica de `validate_allocation`; se reutilizan tal cual.

## Data model

Migración `add_create_payment_with_allocations_rpc` vía MCP `apply_migration`:

```sql
create function public.create_payment_with_allocations(
  p_entity_id     uuid,
  p_direction     public.payment_direction,
  p_payment_date  date,
  p_amount        numeric(12,2),
  p_method        public.payment_method,
  p_reference     text,
  p_notes         text,
  p_allocations   jsonb
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_payment_id  uuid;
  v_item        jsonb;
  v_comprobante_id uuid;
  v_alloc_amount   numeric(12,2);
  v_total          numeric(12,2);
  v_paid           numeric(12,2);
begin
  -- 1) Insert del pago. El trigger payment_assign_receipt
  --    (private.assign_receipt_number) escribe receipt_serial
  --    en before insert, dentro de esta misma transacción,
  --    así que un fallo posterior hace rollback también del
  --    correlativo (no quedan huecos). No se asigna receipt_year
  --    porque el formato actual no incluye el año.
  insert into public.payment (
    entity_id, direction, payment_date, amount, method, reference, notes,
    receipt_serial
  ) values (
    p_entity_id, p_direction, p_payment_date, p_amount, p_method,
    nullif(p_reference, ''), nullif(p_notes, ''),
    0
  )
  returning id into v_payment_id;

  -- 2) Inserciones de asignaciones una a una, bloqueando el
  --    comprobante para serializar contra otras altas concurrentes.
  if p_allocations is not null and jsonb_array_length(p_allocations) > 0 then
    for v_item in select * from jsonb_array_elements(p_allocations)
    loop
      v_comprobante_id := (v_item->>'comprobante_id')::uuid;
      v_alloc_amount   := (v_item->>'amount')::numeric(12,2);

      if v_alloc_amount <= 0 then
        raise exception 'El importe asignado debe ser mayor a 0';
      end if;

      select c.total into v_total
        from public.comprobante c
       where c.id = v_comprobante_id
         for update;

      if v_total is null then
        raise exception 'El comprobante % no existe', v_comprobante_id;
      end if;

      select coalesce(sum(a.amount), 0) into v_paid
        from public.payment_allocation a
        join public.payment p on p.id = a.payment_id
       where a.comprobante_id = v_comprobante_id
         and p.status = 'REGISTRADO';

      if v_paid + v_alloc_amount > v_total then
        raise exception
          'La asignación supera el saldo del comprobante (%)', v_comprobante_id;
      end if;

      insert into public.payment_allocation (payment_id, comprobante_id, amount)
      values (v_payment_id, v_comprobante_id, v_alloc_amount);
    end loop;
  end if;

  return v_payment_id;
end;
$$;

grant execute on function public.create_payment_with_allocations(
  uuid, public.payment_direction, date, numeric, public.payment_method,
  text, text, jsonb
) to anon, authenticated;
```

Notas sobre la migración:

- No se toca la tabla `payment`, ni `payment_allocation`, ni los triggers existentes. La validación de dirección/tipo de comprobante (`validate_allocation`) y de unicidad (`payment_allocation_unique`) sigue corriendo en los `insert into payment_allocation` que dispara la RPC. El raise de `validate_allocation` cae dentro de la misma unidad atómica → rollback completo.
- El trigger `payment_assign_receipt` (`before insert`) corre primero, escribe `receipt_serial` y la columna generada `receipt_number` se actualiza. Si algo más adelante falla, todo el bloque (incluido el `last_serial` de `receipt_sequence`) retrocede: el correlativo queda libre para el siguiente intento, igual que hoy pero sin pagos huérfanos.
- Los triggers `after insert` sobre `payment_allocation` (`allocation_refresh_status`) y `after update` sobre `payment` (`payment_refresh_status`) también forman parte de la transacción: el `comprobante.status` que pasa a `PAGADO` cuando la suma de asignaciones cubre el total queda consistente o se revierte.
- `p_reference`/`p_notes` se guardan como `null` si llegan vacíos (mismo criterio que el `createPayment` actual).
- `p_allocations` es `jsonb` con shape `[{"comprobante_id": "<uuid>", "amount": <numeric>}, …]`. Si viene `[]` o `null`, el pago se crea como anticipo sin asignaciones (mismo comportamiento actual).

Tipos UI (cambios mínimos, additive):

```ts
// components/ventas/types.ts
export interface Sale {
  // ... campos existentes (id, issueDate, registrationDate, voucherType,
  // voucherNumber, entityId, subtotal, igv, total, paymentType,
  // creditDays, dueDate, status)
  paidAmount: number; // suma de payment_allocation.amount con payment.status='REGISTRADO'
  balance: number;    // total - paidAmount, nunca negativo
}

// components/compras/types.ts
export interface Purchase {
  // ... campos existentes
  paidAmount: number;
  balance: number;
}
```

Capa de datos (firmas en `lib/comprobantes/comprobantes.ts` y `lib/comprobantes/compras.ts`):

```ts
// listSales(): Promise<Sale[]>
//   1) select * from comprobante where voucher_kind='VENTA' and deleted_at is null order issue_date desc
//   2) select comprobante_id, paid_amount, balance from voucher_balance where voucher_kind='VENTA'
//   3) merge por id en un Map; paidAmount = balanceMap.get(id)?.paidAmount ?? 0;
//      balance = balanceMap.get(id)?.balance ?? total.
//   Si la vista falla, NO se rompe el render: se usa total como balance y 0 como paidAmount
//   y se conserva el error en consola para diagnóstico.

// listPurchases(): Promise<Purchase[]>  (idéntica lógica para voucher_kind='COMPRA')
```

Capa de pagos (firmas en `lib/pagos/pagos.ts`):

```ts
// createPayment(values: PaymentFormValues): Promise<PaymentDetail>
//   1) rpc('create_payment_with_allocations', {
//        p_entity_id, p_direction, p_payment_date, p_amount, p_method,
//        p_reference, p_notes,
//        p_allocations: values.allocations.map(a => ({
//          comprobante_id: a.comprobanteId, amount: a.amount
//        }))
//      })  → retorna payment_id (uuid).
//   2) Si la RPC lanza error (cualquier código), mapError lo traduce
//      a Error en español; si era P0001 con mensaje del validador,
//      se propaga tal cual (igual que hoy).
//   3) getPaymentDetail(paymentId) para devolver PaymentDetail.

// mapError ampliado:
//   - P0001 → propaga message (validación/raise).
//   - 40001 → "Otro proceso está modificando el comprobante. Reintenta."
//   - 23503 → "La entidad o el comprobante seleccionado no existe."
//   - 23505 → "El comprobante ya está asignado a este pago."
//   - 42883 → "No se pudo crear el pago. Ejecuta la migración de la RPC."
//   - resto → mensaje genérico.
```

Provider de pagos (cambio mínimo, en `components/pagos/pagos-provider.tsx`):

```ts
interface PagosContextValue {
  // ... actual
}
// addPayment(), assignAllocations() y annulPayment() ahora refrescan ventas
// y compras además de la lista de pagos, para que las columnas Pagado/Saldo
// del data table origen reflejen el cambio sin recargar la página.
```

## Implementation plan

1. Aplicar la migración `add_create_payment_with_allocations_rpc` vía MCP con el SQL del data model; revisar advisors de seguridad y rendimiento; confirmar con `list_tables` que la función existe y con un `execute_sql` que `grant execute` está aplicado a `anon` y `authenticated`. Probar manualmente: registrar un pago con 3 asignaciones válidas (uno que cierre totalmente una factura) y un intento de pago con una asignación que supere el saldo — el primero debe dejar la factura PAGADO, el segundo debe fallar sin dejar el pago creado.
2. Regenerar los tipos de Supabase en `lib/supabase/types.ts`. Verificar `npm run lint`.
3. Refactor `lib/pagos/pagos.ts`:
   - `createPayment` pasa a llamar `supabase.rpc('create_payment_with_allocations', ...)` con el payload del data model; conserva la firma externa.
   - El `PaymentRow` con `receipt_serial=0` desaparece del insert: el pago se crea vía la RPC.
   - `mapError` se amplía con los códigos del data model. Verificar `npm run lint`.
4. `components/pagos/pagos-provider.tsx`:
   - Reordenar los providers en `app/layout.tsx` para que `PagosProvider` quede dentro de `VentasProvider`/`ComprasProvider` (`Clientes → Ventas → Compras → Pagos → children`); sin esto los hooks `useVentas`/`useCompras` lanzarían al llamarse desde `PagosProvider`.
   - `addPayment`, `assignAllocations` y `annulPayment` llaman a `useVentas().refresh()` y `useCompras().refresh()` además del propio `refresh()` del provider de pagos, para que las columnas Pagado/Saldo del data table se actualicen tras un pago o una anulación. Verificar `npm run lint`.
5. `components/ventas/types.ts` y `components/compras/types.ts`: añadir `paidAmount: number` y `balance: number` a `Sale`/`Purchase`. Verificar `npm run lint`.
6. `lib/comprobantes/comprobantes.ts`:
   - `listSales` hace las dos consultas en `Promise.all` y enriquece cada `Sale` con `paidAmount`/`balance` desde el `Map` de `voucher_balance`. Si la segunda falla, log de consola y se devuelven las ventas con `paidAmount=0, balance=total`. Verificar `npm run lint`.
7. `lib/comprobantes/compras.ts`: mismo cambio que el paso 6 para `listPurchases`. Verificar `npm run lint`.
8. `components/ventas/sales-columns.tsx`:
   - Eliminar las columnas con `id: "creditDays"` y `id: "dueDate"`.
   - Añadir, en ese mismo orden, la columna `paidAmount` con header "Pagado" (alineado a la derecha, `formatCurrency`) y la columna `balance` con header "Saldo" (alineado a la derecha, `formatCurrency`, clase condicional `text-muted-foreground` si `value === 0`, `font-medium` en otro caso).
   - Conservar el resto del orden: F. emisión, T. comprobante, Nro comprobante, Cliente, Total, Condición, **Pagado**, **Saldo**, Estado pago, Acciones.
   - Limpiar imports no usados. Verificar `npm run lint`.
9. `components/compras/purchases-columns.tsx`: mismos cambios que el paso 8 manteniendo "Proveedor" en la columna 4. Verificar `npm run lint`.
10. Verificación manual con `npm run dev`:
    - `/ventas/listado` y `/compras/listado`: confirman que "Pagado" y "Saldo" aparecen con importes, "Días de crédito" y "F. vencimiento" ya no se ven, el badge "Estado pago" sigue presente.
    - Sobre una factura PENDIENTE con saldo > 0, registrar un pago parcial vía `/pagos/ingresos` (o `/pagos/egresos`): al volver al listado sin recargar, la columna "Pagado" debe haber subido el importe aplicado y "Saldo" debe haber bajado lo mismo.
    - Registrar un pago que complete totalmente la factura: "Saldo" debe pasar a 0.00, "Pagado" debe igualar "Total", y el badge "Estado pago" debe ser PAGADO.
    - Provocar un fallo controlado (asignar importe mayor al saldo): debe mostrarse el `toast.error` con el mensaje del validador y NO debe quedar ningún pago nuevo en `/pagos/ingresos` ni ningún cambio en el saldo del comprobante.
    - Anular un pago con asignaciones: las columnas deben volver a los valores previos a esa asignación sin necesidad de recargar.
11. Cerrar con `npm run lint` y `npm run build` en verde.

## Acceptance criteria

- [x] Existe la función `public.create_payment_with_allocations` con la firma del data model, `security definer`, `search_path = ''` y `grant execute` a `anon` y `authenticated`.
- [x] La RPC inserta `payment` + `payment_allocation` dentro de una sola transacción Postgres (verificado forzando un fallo a mitad del flujo y comprobando que no quedan filas en ninguna de las dos tablas).
- [x] Si la asignación que completa un comprobante (`paid_amount` final == `total`) falla por cualquier motivo, la operación completa se invalida: no queda el pago, no quedan asignaciones, `comprobante.status` no cambia a PAGADO y el correlativo del recibo queda libre para el siguiente intento.
- [x] `createPayment` (en `lib/pagos/pagos.ts`) deja de hacer dos inserciones separadas y pasa a llamar a la RPC; la firma externa `createPayment(values: PaymentFormValues): Promise<PaymentDetail>` se mantiene.
- [x] `addPayment`, `assignAllocations` y `annulPayment` en `PagosProvider` refrescan ventas y compras además de la lista de pagos, de forma que el data table origen muestra el nuevo saldo sin recargar la página.
- [x] `Sale` y `Purchase` (en `components/ventas/types.ts` y `components/compras/types.ts`) tienen `paidAmount: number` y `balance: number`.
- [x] `listSales`/`listPurchases` enriquecen cada fila con `paidAmount` y `balance` desde la vista `voucher_balance`. Si la vista falla, las filas se devuelven con `paidAmount = 0` y `balance = total` y se conserva el error en consola.
- [x] El data table de `/ventas/listado` y `/compras/listado` muestra la columna "Pagado" (alineada a la derecha, con `formatCurrency`) en la posición que ocupaba "Días de crédito".
- [x] El data table muestra la columna "Saldo" (alineada a la derecha, con `formatCurrency`, `text-muted-foreground` cuando vale 0, `font-medium` cuando es > 0) en la posición que ocupaba "F. vencimiento".
- [x] Las columnas "Días de crédito" y "F. vencimiento" ya no aparecen en ningún data table de ventas ni compras.
- [x] Las columnas "Condición" y "Estado pago" siguen presentes con su contenido actual (badge y valor crudo CONTADO/CREDITO, respectivamente).
- [x] Tras registrar un pago parcial, "Pagado" refleja el importe acumulado y "Saldo" refleja el resto, sin recargar la página.
- [x] Tras registrar un pago que completa la factura, "Saldo" = 0.00, "Pagado" = "Total" y el badge pasa a PAGADO.
- [x] Tras anular un pago con asignaciones, "Pagado" baja y "Saldo" sube lo que corresponde, sin recargar la página.
- [x] Los formularios de venta y compra, y los modales de detalle, siguen mostrando "Días de crédito" y "F. vencimiento" como hasta ahora.
- [x] El `ListingsToolbar` sigue mostrando el filtro "Estado pago:" (no se toca SPEC 11/12).
- [x] `npm run lint` y `npm run build` pasan.

## Decisions

- **Sí:** fuente única de `Pagado`/`Saldo` = vista `voucher_balance` (SPEC 09); no se materializan columnas en `comprobante`.
- **Sí:** la atomicidad se garantiza vía una función RPC `security definer` con `plpgsql`, no con un cliente que orquesta varios `await`. La RPC vive en `public` (no en `private`) porque necesita `grant execute` a `anon`/`authenticated` y no expone estado: solo hace inserts validados por los triggers que ya estaban en `private`.
- **Sí:** la RPC reutiliza los triggers existentes (`payment_assign_receipt`, `payment_allocation_validate`, `allocation_refresh_status`, `payment_status_refresh`); no se redefine ninguna validación en SQL del cuerpo de la RPC, salvo las precondiciones que el `for update` necesita antes de delegar en `payment_allocation_validate` (lock + cálculo de saldo actual).
- **Sí:** el `for update` sobre `comprobante` se mantiene dentro de la RPC: aunque el validador de la SPEC 09 ya bloquea la fila, hacerlo explícito dentro del bucle de asignaciones da una garantía adicional frente a inserciones concurrentes cuando una misma factura recibe varias asignaciones en la misma llamada.
- **Sí:** `createPayment` mantiene la firma externa `Promise<PaymentDetail>` para no romper `PagosProvider.addPayment` ni los callers. Por dentro devuelve `getPaymentDetail(id)` tras la RPC.
- **Sí:** el enrichment de `paidAmount`/`balance` ocurre en la capa de datos (`listSales`/`listPurchases`), no en el provider ni en la tabla: la tabla solo renderiza lo que el tipo `Sale`/`Purchase` ya trae.
- **Sí:** `PagosProvider` refresca ventas y compras tras `addPayment`, `assignAllocations` y `annulPayment` para que el data table origen se mantenga sincronizado (incluida la reversión al anular un pago). La recarga se hace dentro del `try` después del alta, sin bloquear la UI.
- **Sí:** reordenar los providers en `app/layout.tsx` para que `PagosProvider` quede anidado dentro de `VentasProvider`/`ComprasProvider`: es la única forma de que `PagosProvider` invoque `useVentas()`/`useCompras()` sin un bus de eventos. Ningún componente consume `usePagos` junto con `useVentas`/`useCompras`, así que el reorden es seguro.
- **Sí:** los formularios y modales de detalle siguen mostrando "Días de crédito" y "F. vencimiento": son parte de la cabecera del comprobante y no dependen del saldo.
- **Sí:** la columna "Estado pago" y el filtro del toolbar se mantienen tal cual: son complementarios a "Pagado"/"Saldo" (señal visual rápida) y quitarlos revertiría SPEC 11/12.
- **No:** cambiar SPEC 09 (tablas, enums, triggers, RLS, vistas, columnas generadas); esta spec solo agrega una función nueva y refactoriza el caller.
- **No:** agregar columnas `Pagado`/`Saldo` al modal de detalle de venta/compra (queda fuera de alcance del pedido explícito).
- **No:** crear RPCs para `addAllocations`, `voidPayment` u operaciones de comprobante; siguen siendo inserts/updates simples en una sola tabla o en flujo cliente.
- **No:** mover los campos `creditDays`/`dueDate` del schema del comprobante (siguen existiendo y se siguen usando en formulario/detalle).

## Risks

| Riesgo | Mitigación |
| --- | --- |
| La RPC corre con `security definer` y necesita `search_path = ''` para no ser troyano | Cualificar todas las referencias (`public.…`) en el cuerpo; probar la migración en un pago real antes de seguir. |
| `for update` sobre `comprobante` dentro de un bucle puede bloquear otras altas si la transacción queda abierta mucho tiempo | El cuerpo de la RPC es trivial (dos `select` y un `insert` por item); el tamaño de `p_allocations` esperado es pequeño. Si en el futuro crece, mover a una sola sentencia `insert … select` con cálculo previo de saldos. |
| El raise de `validate_allocation` (en `private`) cae dentro de la transacción de la RPC, así que un fallo en una asignación revierte también el `insert payment` previo | Es exactamente lo que se quiere; documentado en la spec y verificado con un caso controlado. |
| `PaymentRow` ya no se usa para `createPayment`; los tipos quedan sin uso en `lib/pagos/pagos.ts` | Mantener el type para `mapPaymentRow`; eliminar el literal `receipt_serial=0` del flujo pero dejar `PaymentRow` como tipo de retorno de select. `npm run lint` lo confirma. |
| Dos consultas paralelas (`comprobante` + `voucher_balance`) duplican latencia | `Promise.all` las ejecuta en paralelo; la vista ya está indexada por `comprobante_id` en su `group by`. Medir con `npm run dev` antes/después si hace falta. |
| Si la consulta a `voucher_balance` falla, se rompe el render del listado | `try/catch` por consulta: si falla la vista, se devuelven las ventas/compras con `paidAmount=0, balance=total` y se conserva el error en `console.error` (sin `toast`). El error real del listado (de la tabla) sigue mostrándose con su `toast.error`. |
| El `for update` puede causar `40001` (serialization failure) en concurrencia | `mapError` traduce `40001` a un mensaje accionable ("Reintenta"); el caller del provider dispara `refresh` y la UI se reintenta sola. |
| La columna "Saldo" en el data table podría leerse como duplicada con "Total" cuando saldo = total (comprobante nuevo sin pagos) | Decisión consciente: "Saldo = total" es información útil (el cliente todavía debe todo). El tono `text-muted-foreground` cuando vale 0 distingue claramente el caso PAGADO. |

## What is **not** in this spec

- Quitar los campos `creditDays`/`dueDate` del formulario o del modal de detalle.
- Quitar la columna `status` o el badge `Estado pago` del data table.
- Quitar el filtro `Estado pago:` del `ListingsToolbar`.
- Mostrar `Pagado`/`Saldo` en el modal de detalle de venta o de compra.
- Materializar `paid_amount`/`balance` como columnas reales en `comprobante`.
- Crear RPCs adicionales para `addAllocations`, `voidPayment` o alta de comprobante.
- Cambiar los triggers, enums o tablas existentes de SPEC 09.
- Backfill de saldos (no hay datos previos que migrar; los saldos se calculan siempre desde `payment_allocation`).
- Edición de pagos registrados, cuotas, cronogramas ni alertas de mora nuevas.

Cada uno de esos, si aparece, va en su propia spec.
