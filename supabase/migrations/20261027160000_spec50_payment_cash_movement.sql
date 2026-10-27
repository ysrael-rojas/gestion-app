-- =========================================================================
-- Migración: spec50_payment_cash_movement (SPEC 50, paso 1)
-- =========================================================================
-- 1) payment.is_cash_movement: marca los recibos que no se asignan a
--    comprobantes (movimiento de caja, cargo bancario, vale).
--    Se fija solo en el INSERT: payment_guard_history_mutation impide
--    actualizar otras columnas después.
-- 2) create_payment_with_allocations gana p_is_cash_movement (default false,
--    compatible con el wizard). Se elimina la firma vieja para no dejar una
--    sobrecarga ambigua al llamar con 10 argumentos.
-- 3) create_petty_cash_vale marca true el recibo que genera.
-- =========================================================================

alter table public.payment
  add column is_cash_movement boolean not null default false;

drop function if exists public.create_payment_with_allocations(
  uuid, public.payment_direction, date, numeric, uuid, uuid, uuid, text, text, jsonb
);

create function public.create_payment_with_allocations(
  p_entity_id        uuid,
  p_direction        public.payment_direction,
  p_payment_date     date,
  p_amount           numeric,
  p_method_id        uuid,
  p_cash_account_id  uuid,
  p_category_id      uuid,
  p_reference        text,
  p_notes            text,
  p_allocations      jsonb,
  p_is_cash_movement boolean default false
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_payment_id     uuid;
  v_item           jsonb;
  v_comprobante_id uuid;
  v_alloc_amount   numeric(12,2);
  v_total          numeric(12,2);
  v_paid           numeric(12,2);
begin
  insert into public.payment (
    entity_id, direction, payment_date, amount,
    method_id, cash_account_id, category_id, reference, notes,
    is_cash_movement
  ) values (
    p_entity_id, p_direction, p_payment_date, p_amount,
    p_method_id, p_cash_account_id, p_category_id,
    nullif(p_reference, ''), nullif(p_notes, ''),
    coalesce(p_is_cash_movement, false)
  )
  returning id into v_payment_id;

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
         and p.status <> 'ANULADO';

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
  uuid, public.payment_direction, date, numeric, uuid, uuid, uuid, text, text, jsonb, boolean
) from public, anon;
grant execute on function public.create_payment_with_allocations(
  uuid, public.payment_direction, date, numeric, uuid, uuid, uuid, text, text, jsonb, boolean
) to authenticated, service_role;

-- El recibo del vale de caja chica nace marcado como movimiento de caja:
-- un vale no se asigna a comprobantes.
create or replace function public.create_petty_cash_vale(
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

  insert into public.payment (
    owner_id, entity_id, direction, payment_date, amount,
    method_id, cash_account_id, category_id, notes, is_cash_movement
  ) values (
    v_owner, null, 'EGRESO', v_date, p_amount,
    v_method, p_account_id, p_category_id,
    format('Vale de caja chica N.º %s: %s', v_serial, p_concept),
    true
  )
  returning id into v_payment;

  update public.petty_cash_vale set payment_id = v_payment where id = v_id;

  return v_id;
end;
$$;

revoke execute on function public.create_petty_cash_vale(uuid, date, varchar, varchar, numeric, boolean, uuid) from public, anon;
grant execute on function public.create_petty_cash_vale(uuid, date, varchar, varchar, numeric, boolean, uuid) to authenticated, service_role;
