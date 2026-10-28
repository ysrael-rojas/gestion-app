-- SPEC 57 — Integridad entre usuarios (parte 1: trigger de owner)
--
-- Cierra el acceso cruzado: un usuario autenticado no puede crear ni modificar
-- filas que referencien cuentas, entidades, metodos, categorias o comprobantes
-- de otro usuario.
--
-- Esta parte:
--   1) Trigger private.assert_owner_consistency() en las tablas con FK a datos
--      del owner (payment, payment_allocation, cash_close, cash_transfer,
--      comprobante). Valida en cualquier camino: RPC, insert directo o UPDATE.
--   2) Retira las escrituras directas que no pasan por la RPC:
--      payment, cash_close y cash_transfer. payment_allocation (addAllocations)
--      y comprobante (formulario) se mantienen y quedan cubiertos por el trigger.
--
-- La parte 2 (validaciones de create_payment_with_allocations) va en
-- 20261028180500_spec57_owner_consistency_rpc.sql.

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
    -- El NOT NULL de la tabla lo rechaza; no hay owner contra que comparar.
    return new;
  end if;

  if tg_table_name = 'payment' then
    if not exists (
         select 1 from public.cash_account a
          where a.id = new.cash_account_id and a.owner_id = v_owner)
       or not exists (
         select 1 from public.payment_method m
          where m.id = new.method_id and m.owner_id = v_owner)
       or not exists (
         select 1 from public.cash_receipt_category c
          where c.id = new.category_id and c.owner_id = v_owner)
       or (new.entity_id is not null and not exists (
         select 1 from public.entidad e
          where e.id = new.entity_id and e.owner_id = v_owner))
    then
      raise exception
        'El pago referencia una cuenta, metodo, categoria o entidad de otro usuario'
        using errcode = '42501';
    end if;

  elsif tg_table_name = 'payment_allocation' then
    if not exists (
         select 1 from public.payment p
          where p.id = new.payment_id and p.owner_id = v_owner)
       or not exists (
         select 1 from public.comprobante c
          where c.id = new.comprobante_id and c.owner_id = v_owner)
    then
      raise exception
        'La asignacion referencia un pago o comprobante de otro usuario'
        using errcode = '42501';
    end if;

  elsif tg_table_name = 'cash_close' then
    if not exists (
         select 1 from public.cash_account a
          where a.id = new.cash_account_id and a.owner_id = v_owner)
    then
      raise exception
        'El cierre referencia una cuenta de otro usuario'
        using errcode = '42501';
    end if;

  elsif tg_table_name = 'cash_transfer' then
    if not exists (
         select 1 from public.cash_account a
          where a.id = new.source_account_id and a.owner_id = v_owner)
       or not exists (
         select 1 from public.cash_account a
          where a.id = new.target_account_id and a.owner_id = v_owner)
    then
      raise exception
        'La transferencia referencia una cuenta de otro usuario'
        using errcode = '42501';
    end if;

  elsif tg_table_name = 'comprobante' then
    if not exists (
         select 1 from public.entidad e
          where e.id = new.entity_id and e.owner_id = v_owner)
       or (new.referenced_comprobante_id is not null and not exists (
         select 1 from public.comprobante c
          where c.id = new.referenced_comprobante_id and c.owner_id = v_owner))
    then
      raise exception
        'El comprobante referencia una entidad o comprobante de otro usuario'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.assert_owner_consistency() from public, anon, authenticated;

drop trigger if exists payment_owner_consistency on public.payment;
create trigger payment_owner_consistency
  before insert or update on public.payment
  for each row execute function private.assert_owner_consistency();

drop trigger if exists payment_allocation_owner_consistency on public.payment_allocation;
create trigger payment_allocation_owner_consistency
  before insert or update on public.payment_allocation
  for each row execute function private.assert_owner_consistency();

drop trigger if exists cash_close_owner_consistency on public.cash_close;
create trigger cash_close_owner_consistency
  before insert or update on public.cash_close
  for each row execute function private.assert_owner_consistency();

drop trigger if exists cash_transfer_owner_consistency on public.cash_transfer;
create trigger cash_transfer_owner_consistency
  before insert or update on public.cash_transfer
  for each row execute function private.assert_owner_consistency();

drop trigger if exists comprobante_owner_consistency on public.comprobante;
create trigger comprobante_owner_consistency
  before insert or update on public.comprobante
  for each row execute function private.assert_owner_consistency();

drop policy if exists payment_insert on public.payment;
drop policy if exists cash_close_insert on public.cash_close;
drop policy if exists cash_transfer_insert on public.cash_transfer;

revoke insert on public.payment from anon, authenticated;
revoke insert on public.cash_close from anon, authenticated;
revoke insert on public.cash_transfer from anon, authenticated;

comment on function private.assert_owner_consistency() is
  'SPEC 57: valida que las FK de la fila pertenezcan al owner de la fila.';
