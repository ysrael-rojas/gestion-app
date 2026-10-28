# SPEC 57 — Integridad entre usuarios

> **Status:** Implementado
> **Depends on:** SPEC 16, SPEC 19, SPEC 26, SPEC 49
> **Date:** 2026-10-28
> **Objective:** Impedir que un usuario autenticado pueda crear o modificar pagos, asignaciones, cierres, transferencias o comprobantes que referencien cuentas, entidades o comprobantes de otro usuario, validando la propiedad de cada referencia en la base y retirando las escrituras directas que no pasan por las RPC.

## Why this spec exists

La auditoría pre-producción (2026-10-28) reprodujo un fallo de integridad entre inquilinos:

```
usuario falso (sub 9999…) llama create_payment_with_allocations
  con la cuenta y la factura a0000003 del owner real
→ el pago se crea con owner_id del atacante
→ la asignación se crea
→ la factura del owner real pasa de PENDIENTE a PAGADO
```

La RPC es `SECURITY DEFINER` y no valida que `cash_account_id`, `method_id`, `category_id`, `entity_id` ni los `comprobante_id` de las asignaciones pertenezcan a `auth.uid()`. El mismo patrón aparece en las policies `INSERT` de `cash_close`, `cash_transfer`, `payment` y `payment_allocation`: validan el `owner_id` de la fila, pero no la propiedad de las claves foráneas referenciadas.

Con el registro ya cerrado (SPEC 56) y un solo usuario, hoy no hay un segundo inquilino que ataque; esta spec es **defensa en profundidad** para una sesión filtrada, un error de configuración o un segundo usuario futuro. Es la segunda de las tres specs de la Fase 0 (56 registro → **57 integridad** → 58 dependencias y cabeceras).

## Scope

**In:**

1. **Trigger de consistencia de owner** (`supabase/migrations/`):
   - Función `private.assert_owner_consistency()` (`security definer`, `search_path = ''`) que compara `NEW.owner_id` con el owner de cada FK y lanza `42501` si no coincide.
   - Triggers `BEFORE INSERT OR UPDATE` en `payment`, `payment_allocation`, `cash_close`, `cash_transfer` y `comprobante`.
2. **Validaciones explícitas en `create_payment_with_allocations`** (misma migración):
   - Exigir `auth.uid()` no nulo.
   - Verificar que la cuenta, el método, la categoría y la entidad (si viene) pertenecen al usuario.
   - En cada asignación, leer `owner_id` del comprobante con `FOR UPDATE` y rechazar si no es del usuario.
   - Insertar el pago con `owner_id` explícito.
3. **Retirar escrituras directas que no pasan por la RPC:**
   - `DROP POLICY` de `INSERT` en `cash_close`, `cash_transfer` y `payment`, y `REVOKE INSERT` a `anon` y `authenticated` en las tres.
   - **Se mantiene** el `INSERT` de `payment_allocation` porque `addAllocations()` lo usa directo; queda protegido por el trigger.
   - **Se mantiene** el `INSERT`/`UPDATE` de `comprobante` (el formulario escribe directo); queda protegido por el trigger.
4. **Script de verificación** `supabase/verify-owner-consistency.sql` (solo lectura de datos reales; todo en transacciones con `rollback`):
   - Crea un usuario de prueba en `auth.users` dentro de la transacción y se impersona con `request.jwt.claims`.
   - Casos que deben fallar con `42501`: pago con cuenta ajena, asignación a comprobante ajeno, cierre con cuenta ajena, transferencia con cuenta ajena.
   - Caso que debe pasar: pago propio con asignación a comprobante propio y cierre propio por RPC.
5. **Validación:** `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build`, advisors y el script de verificación.

**Out of scope (for future specs):**

- `receipt_sequence` con `owner_id` (numeración de recibos por empresa): Fase 2.
- Modelo empresa + roles (`company_id` compartido, admin/cajero).
- Reescribir `private.cash_expected_balance`, `private.assert_account_open_for` o `private.validate_allocation`: el trigger cierra el hueco y no se tocan para no romper llamadas legítimas.
- Paginación server-side, dependencias y cabeceras (SPEC 58).
- Cambios de UI, formularios o mensajes de la app.

## Data model

No hay tablas ni columnas nuevas. Una función, cinco triggers y cambios de policies/grants:

```sql
create or replace function private.assert_owner_consistency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := new.owner_id;
begin
  if v_owner is null then
    return new; -- el NOT NULL de la tabla lo rechaza
  end if;

  if tg_table_name = 'payment' then
    if not exists (select 1 from public.cash_account a
                    where a.id = new.cash_account_id and a.owner_id = v_owner)
       or not exists (select 1 from public.payment_method m
                       where m.id = new.method_id and m.owner_id = v_owner)
       or not exists (select 1 from public.cash_receipt_category c
                       where c.id = new.category_id and c.owner_id = v_owner)
       or (new.entity_id is not null and not exists (
             select 1 from public.entidad e
              where e.id = new.entity_id and e.owner_id = v_owner))
    then
      raise exception 'El pago referencia una cuenta, método, categoría o entidad de otro usuario'
        using errcode = '42501';
    end if;

  elsif tg_table_name = 'payment_allocation' then
    if not exists (select 1 from public.payment p
                    where p.id = new.payment_id and p.owner_id = v_owner)
       or not exists (select 1 from public.comprobante c
                       where c.id = new.comprobante_id and c.owner_id = v_owner)
    then
      raise exception 'La asignación referencia un pago o comprobante de otro usuario'
        using errcode = '42501';
    end if;

  elsif tg_table_name = 'cash_close' then
    if not exists (select 1 from public.cash_account a
                    where a.id = new.cash_account_id and a.owner_id = v_owner) then
      raise exception 'El cierre referencia una cuenta de otro usuario'
        using errcode = '42501';
    end if;

  elsif tg_table_name = 'cash_transfer' then
    if not exists (select 1 from public.cash_account a
                    where a.id = new.source_account_id and a.owner_id = v_owner)
       or not exists (select 1 from public.cash_account a
                       where a.id = new.target_account_id and a.owner_id = v_owner)
    then
      raise exception 'La transferencia referencia una cuenta de otro usuario'
        using errcode = '42501';
    end if;

  elsif tg_table_name = 'comprobante' then
    if not exists (select 1 from public.entidad e
                    where e.id = new.entity_id and e.owner_id = v_owner)
       or (new.referenced_comprobante_id is not null and not exists (
             select 1 from public.comprobante c
              where c.id = new.referenced_comprobante_id and c.owner_id = v_owner))
    then
      raise exception 'El comprobante referencia una entidad o comprobante de otro usuario'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

-- Un trigger por tabla, BEFORE INSERT OR UPDATE.
-- (payment, payment_allocation, cash_close, cash_transfer, comprobante)

drop policy cash_close_insert on public.cash_close;
drop policy cash_transfer_insert on public.cash_transfer;
drop policy payment_insert on public.payment;
revoke insert on public.cash_close, public.cash_transfer, public.payment
  from anon, authenticated;
```

`create_payment_with_allocations` conserva su firma; solo agrega validaciones y el `owner_id` explícito.

## Implementation plan

1. **Migración** `spec57_owner_consistency`: función, cinco triggers, drop de policies y revokes; recrear `create_payment_with_allocations` con las validaciones y el `owner_id` explícito. Versionar el SQL en `supabase/migrations/`.
2. **Script de verificación** `supabase/verify-owner-consistency.sql` con los cuatro casos de rechazo y el caso feliz, todo con `rollback`.
3. **Validación**: correr el script contra la base y comprobar que los cuatro casos fallan con `42501` y que el flujo normal funciona; `tsc`, lint, test, build y advisors.
4. **Cierre**: notas de implementación en la spec y estado `Implementado` si todo pasa.

## Acceptance criteria

- [x] Un pago creado por un usuario contra la cuenta de otro falla con `42501` y no deja filas.
- [x] Una asignación contra un comprobante de otro falla con `42501` y no altera el estado del comprobante ajeno.
- [x] Un cierre (`cash_close`) y una transferencia (`cash_transfer`) que referencien cuentas ajenas fallan y no dejan filas.
- [x] Un comprobante que referencie una entidad o un comprobante de otro usuario falla con `42501`.
- [x] El flujo normal sigue funcionando: registrar pago propio con asignación, cerrar caja propia por RPC y transferir entre cuentas propias.
- [x] `payment`, `cash_close` y `cash_transfer` ya no aceptan `INSERT` directo de `anon`/`authenticated`; `payment_allocation` y `comprobante` siguen escribiéndose desde la app.
- [x] El script de verificación corre completo con `rollback` y no deja usuarios ni filas de prueba.
- [x] `npx tsc --noEmit`, `npm run lint`, `npm test` y `npm run build` en verde; advisors sin hallazgos nuevos.

## Decisions

- **Sí:** un solo trigger genérico con `tg_table_name` en lugar de cinco funciones. Menos objetos que auditar y un único lugar para el mensaje y el `errcode`.
- **Sí:** trigger + checks explícitos en la RPC. El trigger protege cualquier camino (incluido el directo); los checks dan un error claro antes de insertar.
- **Sí:** mantener `INSERT` directo en `payment_allocation` (lo usa `addAllocations`) y en `comprobante` (formulario). El trigger es la garantía.
- **No:** reescribir `cash_expected_balance`, `assert_account_open_for` ni `validate_allocation`. El trigger impide que existan filas cruzadas; tocarlas agregaría riesgo sin beneficio.
- **Sí:** validar también en `UPDATE` (asignar entidad a un pago, editar un comprobante). El costo es el mismo.
- **Asumido:** sigue habiendo un solo usuario. Si se agrega un segundo, la spec de empresa + roles debe resolver el `company_id` compartido.

### Notas de implementación (2026-10-28)

- Migración en dos partes, aplicadas por MCP y versionadas: `20261028180000_spec57_owner_consistency.sql` (función + 5 triggers + drop de policies/revokes) y `20261028180500_spec57_owner_consistency_rpc.sql` (RPC con validaciones y `owner_id` explícito).
- Verificación con `supabase/verify-owner-consistency.sql`, bloque por bloque con `rollback`:
  - Bloque 1: pago con cuenta ajena → `42501 La cuenta de caja no existe` (la RPC falla antes de insertar).
  - Bloque 2: asignación a comprobante ajeno → `42501 La asignacion referencia un pago o comprobante de otro usuario` (trigger).
  - Bloque 3a: cierre directo como `authenticated` → `42501 permission denied for table cash_close`; 3b como postgres con cuenta ajena → `42501 El cierre referencia una cuenta de otro usuario`.
  - Bloque 4a/4b: transferencia → `permission denied` / `42501 La transferencia referencia una cuenta de otro usuario`.
  - Bloque 5: comprobante con entidad ajena → `42501 El comprobante referencia una entidad o comprobante de otro usuario`.
  - Bloque 6: flujo normal (pago + asignación + transferencia + cierre por RPC) → **OK**.
- Sin residuos: 1 usuario, 0 filas del intruso, 8 cierres, 2 transferencias y caja en S/ 15,409 (igual que antes de la verificación).
- Policies resultantes: solo `SELECT` (y `UPDATE` en `payment`); `INSERT` revocado en `payment`, `cash_close` y `cash_transfer`.
- 632 tests en 75 archivos, `tsc`/lint/build verdes; advisors sin hallazgos nuevos (siguen los 3 previos: `receipt_sequence`, 10 definer y leaked password).
- Playwright: 10 rutas (resumen, ventas, compras, pagos, caja y clientes) sin errores de consola ni alertas.

## Risks

| Risk | Mitigación |
| --- | --- |
| El trigger agrega 1–4 lookups por insert | Son búsquedas por PK sobre tablas chicas; medir con `EXPLAIN` si el volumen crece |
| Un seed o script inserta con `owner_id` nulo | El trigger no valida si `owner_id` es nulo; el `NOT NULL` de la tabla lo rechaza |
| Revocar `INSERT` en `payment` rompe un flujo no detectado | La app solo inserta pagos por RPC (`createPayment`); verificado con grep y con el e2e |
| Mensajes de error poco claros en la UI | `mapError` ya traduce `42501` a "No tienes permisos para esta operación…" |
| El script de verificación deja datos | Todo va en transacciones con `rollback`, incluido el usuario de prueba |
| Un segundo usuario futuro reabre el problema de datos | Documentado: no crear usuarios adicionales hasta la spec de empresa + roles |

## What is **not** in this spec

Numeración de recibos por empresa, modelo empresa/roles, reescritura de las funciones privadas de saldo, paginación, dependencias, cabeceras y cualquier cambio de UI. Cada uno, si llega, va en su propia spec.
