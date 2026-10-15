-- SPEC 36: numeración única por tipo, inmutabilidad de comprobantes con pagos y fin del borrado físico.
--
-- Contexto verificado el 2026-10-15 antes de aplicar: 14 comprobantes vivos (todos VENTA),
-- 0 números duplicados, 0 números fuera del patrón serie-correlativo y 0 filas de COMPRA,
-- así que el índice único se crea sin renombrar nada.

-- 1) Unicidad del número de comprobante por dueño y tipo, entre comprobantes vivos.
--    El mismo número entre una VENTA y una COMPRA es legítimo: el número de la factura
--    del proveedor es suyo, no nuestro.
create unique index if not exists comprobante_owner_kind_number_key
  on public.comprobante (owner_id, voucher_kind, voucher_number)
  where deleted_at is null;

-- 2) Un comprobante con pagos no anulados no cambia importe, número, cliente ni fecha.
--    La regla de "pagado" replica la vista voucher_balance: suma de asignaciones cuyo
--    pago no está ANULADO. Va en `private` y como SECURITY DEFINER para ver el saldo
--    completo aunque quien edite tenga RLS.
create or replace function private.protect_paid_comprobante()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_paid numeric(12,2);
begin
  select coalesce(sum(a.amount), 0) into v_paid
    from public.payment_allocation a
    join public.payment p on p.id = a.payment_id
   where a.comprobante_id = old.id
     and p.status <> 'ANULADO';

  if v_paid > 0
     and (new.total is distinct from old.total
          or new.voucher_number is distinct from old.voucher_number
          or new.entity_id is distinct from old.entity_id
          or new.issue_date is distinct from old.issue_date) then
    raise exception 'No se puede modificar un comprobante con pagos registrados: anula los pagos antes de cambiar importe, numero, cliente o fecha';
  end if;

  return new;
end;
$function$;

drop trigger if exists comprobante_protect_paid on public.comprobante;
create trigger comprobante_protect_paid
  before update on public.comprobante
  for each row
  execute function private.protect_paid_comprobante();

-- 3) El comprobante emitido no se borra físicamente: la baja es lógica (deleted_at).
--    Quitar la política no toca comprobante_select, comprobante_insert ni comprobante_update.
drop policy if exists comprobante_delete on public.comprobante;
