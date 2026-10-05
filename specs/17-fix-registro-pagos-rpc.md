# SPEC 17 — Fix: registro de pagos roto por `receipt_year` en la RPC

> **Status:** Aprobado
> **Depends on:** SPEC 09, SPEC 13, SPEC 16
> **Date:** 2026-10-05
> **Objective:** Restaurar el registro de pagos recreando `create_payment_with_allocations` sin la referencia a la columna eliminada `receipt_year`, versionar esa migración en el repo y mapear los errores `42703`/`42501` con mensajes comprensibles en `mapError`.

## Why this spec exists

Desde que la migración `20260930120000_rename_receipt_format_drop_year` eliminó la columna `receipt_year` de `public.payment`, toda llamada a la RPC `create_payment_with_allocations` falla con `42703: column "receipt_year" of relation "payment" does not exist`. La función sigue teniendo esa referencia en su `insert into public.payment` y `create or replace` nunca se hizo después del rename. Como `mapError` no reconoce el código `42703`, la UI muestra el mensaje genérico "No se pudo completar la acción con la base de datos" y parece un problema de infraestructura. Además, la migración que creó esta RPC (SPEC 13) se aplicó vía MCP y nunca quedó en `supabase/migrations/`: si se restaurara la DB desde cero, la RPC no existiría. Este fix restaura el flujo completo con el body correcto, versiona la migración y cierra el agujero de observabilidad.

## Scope

**In:**

- Migración `recreate_create_payment_rpc_no_receipt_year`: `create or replace function public.create_payment_with_allocations(...)` con el body de la SPEC 13 **sin ninguna referencia a `receipt_year`**, más `revoke execute ... from public` y `grant execute ... to authenticated, service_role` (consistente con `20261003120000_rls_owner_isolation.sql`).
- Nuevo archivo versionado `supabase/migrations/20261005120000_recreate_create_payment_rpc_no_receipt_year.sql` con el mismo SQL que se aplica vía MCP.
- `lib/pagos/pagos.ts`: `mapError` añade dos códigos nuevos del data model (42703, 42501).
- Verificación manual del flujo completo de pagos contra el dev server.

**Out of scope (for future specs):**

- Anticipos sin cliente y asignación tardía de saldo: SPEC 18.
- Reparar el e2e `registrar-pago-y-ver-saldo.spec.ts` (sin login, selector ambiguo, botón tapado): spec propia de tests cuando se retome.
- Backfill de las migraciones históricas que solo existen en la DB y no en `supabase/migrations/` (solo se versiona esta).
- RPC transaccional para `addAllocations` y `voidPayment` (SPEC 13 lo dejó fuera expresamente).
- Doble submit en el modal, pickers con errores tragados, proveedores invisibles en egresos, decimales del schema zod: SPEC 18 o spec de calidad posterior.
- Cambiar triggers, vistas, enums, RLS o el formato de recibos.

## Data model

Esta spec no crea estructuras nuevas. Recrea una función existente con su body corregido.

Migración `recreate_create_payment_rpc_no_receipt_year` vía MCP `apply_migration` (el contenido del archivo versionado es exactamente este):

```sql
create or replace function public.create_payment_with_allocations(
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
  --    correlativo (no quedan huecos).
  insert into public.payment (
    entity_id, direction, payment_date, amount, method, reference, notes
  ) values (
    p_entity_id, p_direction, p_payment_date, p_amount, p_method,
    nullif(p_reference, ''), nullif(p_notes, '')
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

revoke execute on function public.create_payment_with_allocations(
  uuid, public.payment_direction, date, numeric, public.payment_method,
  text, text, jsonb
) from public, anon;

grant execute on function public.create_payment_with_allocations(
  uuid, public.payment_direction, date, numeric, public.payment_method,
  text, text, jsonb
) to authenticated, service_role;
```

Diferencias respecto al body de la SPEC 13: se elimina `receipt_serial 0` como columna explícita del insert (el trigger `before insert` lo escribe solo; listar `receipt_serial` con 0 era un resto del esquema viejo y no aporta nada) y no se referencia `receipt_year` en ningún punto.

Cambios en `lib/pagos/pagos.ts` (solo `mapError`, en `lib/pagos/pagos.ts:104-132`):

```ts
// Añadir al mapeo de códigos existente (P0001, 23503, 23505, 23514, 40001, 42883):
//   42703 → "Error interno: el esquema de la base de datos está desactualizado. Avisa al administrador."
//   42501 → "No tienes permisos para esta operación. Cierra sesión y vuelve a entrar."
```

## Implementation plan

1. Crear el archivo `supabase/migrations/20261005120000_recreate_create_payment_rpc_no_receipt_year.sql` con el SQL del data model. (El repo queda versionado aunque la aplicación aún no se haya hecho.)
2. Aplicar la misma migración vía MCP `apply_migration` con nombre `recreate_create_payment_rpc_no_receipt_year`; revisar advisors de seguridad y rendimiento; confirmar con `execute_sql` que `pg_get_functiondef` de la función no contiene `receipt_year` y que los grants quedan solo en `authenticated` y `service_role`.
3. Verificación manual contra `npm run dev` (aquí la app vuelve a funcionar):
   - Registrar pago simple sin asignaciones (anticipo con cliente) en `/pagos/ingresos`: recibo `RI-…` emitido, aparece en el listado.
   - Registrar pago con asignación parcial a una factura PENDIENTE: `Pagado` sube y `Saldo` baja en el listado de ventas sin recargar.
   - Registrar el pago que completa el saldo de una factura: badge pasa a PAGADO.
   - Intentar asignar importe mayor al saldo: `toast.error` con el mensaje del validador, no queda pago nuevo ni salto de correlativo.
4. Editar `mapError` en `lib/pagos/pagos.ts` con los dos códigos del data model. Verificar `npm run lint`.
5. Validación final: `npm run lint` && `npm test` && `npm run build` en verde.

## Acceptance criteria

- [ ] Existe el archivo `supabase/migrations/20261005120000_recreate_create_payment_rpc_no_receipt_year.sql` con el SQL del data model.
- [ ] La función `public.create_payment_with_allocations` en la DB no contiene `receipt_year` en su definición (`pg_get_functiondef`).
- [ ] `revoke ... from public, anon` y `grant ... to authenticated, service_role` aplicados sobre la función.
- [ ] Registrar un pago sin asignaciones desde `/pagos/ingresos` funciona: aparece en el listado con su recibo y persiste al recargar.
- [ ] Registrar un pago con asignación parcial actualiza `Pagado`/`Saldo` en el listado de ventas sin recargar.
- [ ] Registrar el pago que cubre el total deja el comprobante PAGADO.
- [ ] Asignar un importe mayor al saldo muestra `toast.error` con el mensaje del validador y no crea ningún pago (rollback completo, sin hueco de correlativo).
- [ ] Un error `42703` de la RPC muestra "Error interno: el esquema de la base de datos está desactualizado. Avisa al administrador." (verificado forzando el error con el body viejo antes del fix, o por revisión de código).
- [ ] Un error `42501` de la RPC muestra "No tienes permisos para esta operación. Cierra sesión y vuelve a entrar."
- [ ] `npm run lint`, `npm test` y `npm run build` pasan.

## Decisions

- **Sí:** `create or replace` en vez de `drop function + create`: mantiene grants/dependencias y evita una ventana donde la RPC no existe; el body corregido es la fuente de verdad.
- **Sí:** eliminar del insert la columna explícita `receipt_serial 0`: era un vestigio del esquema viejo; el trigger `payment_assign_receipt` escribe el correlativo en `before insert`.
- **Sí:** versionar la migración en `supabase/migrations/`: la RPC solo existía en la DB remota; sin el archivo, restaurar la DB desde cero rompe los pagos.
- **Sí:** mapear `42703` y `42501` en `mapError`: son los dos códigos de infraestructura/permisos que aparecen como genérico engañoso; convierten el síntoma en un mensaje accionable.
- **No:** reparar el e2e de pagos en esta spec: está roto por 3 razones independientes (sin login, selector ambiguo, botón bajo overlay) y merece su propia spec de tests.
- **No:** revisitar el formato de recibos ni los triggers: la migración `20260930120000` ya los dejó correctos; el bug era solo el body de la RPC.
- **No:** agregar todos los bugfixes menores detectados en la exploración (4.1, 4.5, 4.6, 4.7): salen de esta spec y se reparten en SPEC 18 y specs futuras.

## Risks

| Riesgo | Mitigación |
| --- | --- |
| El body real de la función en la DB pudo divergir de la SPEC 13 en más puntos que `receipt_year` | El `create or replace` se aplica con el body completo conocido-esperado; el paso 3 valida el flujo completo (anticipo, parcial, total, rollback) y no solo el caso feliz. |
| Diferencia de firma entre el `create or replace` y la función existente | La firma respeta exactamente la SPEC 13 y los tipos ya generados en `lib/supabase/types.ts:385-397`; si la firma difiriera, Postgres crea una función nueva con la misma firma y `apply_migration` permite comparar antes de continuar. |
| Al re-grant/revoke, otro consumer rompiendo por `anon` | `anon` ya no debe acceder (decisión de la migración `20261003120000`); el e2e que la usaba sin login ya está roto por otras causas y queda fuera de alcance. |

## What is **not** in this spec

- Anticipo sin cliente (SPEC 18).
- Asignación tardía de anticipos (SPEC 18).
- Reparación del e2e de pagos.
- Backfill de migraciones faltantes distintas a esta.
- RPCs para `addAllocations`/`voidPayment`.

Cada uno de esos, si aterriza, va en su propia spec.
