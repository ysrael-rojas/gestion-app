-- =========================================================================
-- Migración: spec49_petty_cash_vale_generates_expense (SPEC 49, paso 1)
-- =========================================================================
-- El vale de caja chica genera su recibo de egreso: sin esto el saldo
-- esperado de la caja chica no baja y el cierre no cuadra.
-- 1) petty_cash_vale.payment_id (FK al recibo generado).
-- 2) create_petty_cash_vale con categoría obligatoria: inserta el vale y el
--    payment EGRESO (método Efectivo) y guarda el vínculo.
-- 3) void_petty_cash_vale anula también el recibo ligado.
-- =========================================================================

alter table public.petty_cash_vale
  add column payment_id uuid references public.payment (id);

create index petty_cash_vale_payment_id_idx
  on public.petty_cash_vale (payment_id);

-- Reemplaza la RPC de 6 argumentos por la de 7 (categoría obligatoria).
drop function if exists public.create_petty_cash_vale(uuid, date, varchar, varchar, numeric, boolean);

create function public.create_petty_cash_vale(
  p_account_id  uuid,
  p_vale_date   date,
  p_paid_to     varchar,
  p_concept     varchar,
  p_amount      numeric,
  p_has_receipt boolean,
  p_category_id uuid
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_owner    uuid;
  v_is_petty boolean;
  v_limit    numeric(12,2);
  v_date     date;
  v_serial   integer;
  v_method   uuid;
  v_payment  uuid;
  v_id       uuid;
begin
  select a.owner_id, a.is_petty_cash, a.petty_expense_limit
    into v_owner, v_is_petty, v_limit
    from public.cash_account a
   where a.id = p_account_id
     and a.is_active = true
     and a.deleted_at is null
     for update;

  if v_owner is null or v_owner is distinct from auth.uid() then
    raise exception 'La cuenta de caja chica no existe';
  end if;

  if v_is_petty is not true then
    raise exception 'La cuenta no está marcada como caja chica';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'El monto del vale debe ser mayor a cero';
  end if;

  if v_limit is not null and p_amount > v_limit then
    raise exception 'El monto del vale (%) supera el límite por gasto de la caja chica (%)',
      p_amount, v_limit;
  end if;

  if coalesce(p_paid_to, '') = '' then
    raise exception 'Indica a quién se pagó el vale';
  end if;

  if coalesce(p_concept, '') = '' then
    raise exception 'Indica el concepto del vale';
  end if;

  if p_category_id is null then
    raise exception 'Selecciona la categoría del gasto del vale';
  end if;

  if not exists (
    select 1
      from public.cash_receipt_category c
     where c.id = p_category_id
       and c.owner_id = v_owner
       and c.direction = 'EGRESO'
       and c.is_active
  ) then
    raise exception 'La categoría del vale no es válida';
  end if;

  select m.id into v_method
    from public.payment_method m
   where m.owner_id = v_owner
     and m.code = 'EFECTIVO'
     and m.is_active
   limit 1;

  if v_method is null then
    raise exception 'No existe el método de pago Efectivo para esta cuenta';
  end if;

  v_date := coalesce(p_vale_date, current_date);
  perform private.assert_account_open_for(p_account_id, v_date);

  -- La fila de cash_account está bloqueada: el correlativo por cuenta queda
  -- serializado frente a vales concurrentes.
  select coalesce(max(v.serial), 0) + 1 into v_serial
    from public.petty_cash_vale v
   where v.account_id = p_account_id;

  insert into public.petty_cash_vale (
    owner_id, account_id, serial, vale_date, paid_to, concept, amount, has_receipt
  ) values (
    v_owner, p_account_id, v_serial, v_date,
    p_paid_to, p_concept, p_amount, coalesce(p_has_receipt, false)
  )
  returning id into v_id;

  -- El gasto del vale entra al flujo de caja como recibo de egreso (SPEC 49).
  insert into public.payment (
    owner_id, entity_id, direction, payment_date, amount,
    method_id, cash_account_id, category_id, notes
  ) values (
    v_owner, null, 'EGRESO', v_date, p_amount,
    v_method, p_account_id, p_category_id,
    format('Vale de caja chica N.º %s: %s', v_serial, p_concept)
  )
  returning id into v_payment;

  update public.petty_cash_vale set payment_id = v_payment where id = v_id;

  return v_id;
end;
$$;

revoke execute on function public.create_petty_cash_vale(uuid, date, varchar, varchar, numeric, boolean, uuid) from public, anon;
grant execute on function public.create_petty_cash_vale(uuid, date, varchar, varchar, numeric, boolean, uuid) to authenticated, service_role;

-- Anular el vale anula también su recibo (con motivo y fecha), respetando
-- payment_guard_history_mutation (EN_REVISION|PROCESADO -> ANULADO).
create or replace function public.void_petty_cash_vale(p_vale_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_status  public.vale_status;
  v_payment uuid;
  v_serial  integer;
begin
  select v.status, v.payment_id, v.serial
    into v_status, v_payment, v_serial
    from public.petty_cash_vale v
   where v.id = p_vale_id
     and v.owner_id = auth.uid()
     for update;

  if v_status is null then
    raise exception 'El vale no existe';
  end if;

  if v_status <> 'PENDIENTE' then
    raise exception 'Solo se pueden anular vales pendientes';
  end if;

  update public.petty_cash_vale set status = 'ANULADO' where id = p_vale_id;

  if v_payment is not null then
    update public.payment
       set status = 'ANULADO',
           void_reason = 'Anulación de vale de caja chica N.º ' || v_serial,
           voided_at = now()
     where id = v_payment
       and status in ('EN_REVISION', 'PROCESADO');
  end if;
end;
$$;

revoke execute on function public.void_petty_cash_vale(uuid) from public, anon;
grant execute on function public.void_petty_cash_vale(uuid) to authenticated, service_role;
