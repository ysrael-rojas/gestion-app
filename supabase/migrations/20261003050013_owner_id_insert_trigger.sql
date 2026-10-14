-- Asigna owner_id automáticamente en los inserts y cierra el acceso directo a
-- receipt_sequence.
--
-- Contexto: la migración 20261003120000 creó las políticas
-- `with check (owner_id = auth.uid())`, pero ninguna ruta de inserción envía
-- owner_id: los formularios de clientes, comprobantes y cajas hacen insert
-- desde el navegador, y create_payment_with_allocations inserta desde una
-- función SECURITY DEFINER. Sin este trigger, todo insert falla.
--
-- Se resuelve en la base y no en el cliente por dos razones:
--   1. Cubre también la RPC, que al ser SECURITY DEFINER ignora RLS.
--   2. No obliga a tocar cada punto de inserción y evita que uno futuro
--      olvide el campo y rompa en silencio.

-- ---------------------------------------------------------------------------
-- 1. Trigger de asignación
-- ---------------------------------------------------------------------------

-- SECURITY INVOKER (default) a propósito: los triggers corren con los
-- privilegios de quien los dispara, así que no necesitan GRANT y no activan el
-- aviso de linter sobre security_definer_search_path.
-- auth.uid() lee el JWT de la petición y funciona igual dentro de una función
-- SECURITY DEFINER, porque el claim GUC se establece antes de resolver la
-- consulta.
create or replace function public.set_owner_id_on_insert()
  returns trigger
  language plpgsql
  set search_path = public, pg_temp
as $$
begin
  if new.owner_id is null and auth.uid() is not null then
    new.owner_id := auth.uid();
  end if;

  return new;
end;
$$;

drop trigger if exists trg_entidad_owner_id on public.entidad;
create trigger trg_entidad_owner_id
  before insert on public.entidad
  for each row execute function public.set_owner_id_on_insert();

drop trigger if exists trg_comprobante_owner_id on public.comprobante;
create trigger trg_comprobante_owner_id
  before insert on public.comprobante
  for each row execute function public.set_owner_id_on_insert();

drop trigger if exists trg_payment_owner_id on public.payment;
create trigger trg_payment_owner_id
  before insert on public.payment
  for each row execute function public.set_owner_id_on_insert();

drop trigger if exists trg_payment_allocation_owner_id on public.payment_allocation;
create trigger trg_payment_allocation_owner_id
  before insert on public.payment_allocation
  for each row execute function public.set_owner_id_on_insert();

drop trigger if exists trg_cash_account_owner_id on public.cash_account;
create trigger trg_cash_account_owner_id
  before insert on public.cash_account
  for each row execute function public.set_owner_id_on_insert();

-- ---------------------------------------------------------------------------
-- 2. receipt_sequence deja de ser legible por el cliente
-- ---------------------------------------------------------------------------

-- El correlativo es interno: lo lee la función private de serialización desde
-- la RPC. Exponerlo en `using (true)` filtraba el estado del contador global a
-- cualquier usuario autenticado, sin que ningún flujo de la app lo necesite.
drop policy if exists receipt_sequence_select on public.receipt_sequence;