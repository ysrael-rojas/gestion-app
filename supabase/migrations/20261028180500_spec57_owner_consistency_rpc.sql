-- SPEC 57 — Integridad entre usuarios (parte 2: RPC de pagos)
--
-- create_payment_with_allocations conserva su firma, pero ahora:
--   * exige auth.uid() no nulo;
--   * valida que la cuenta, el metodo, la categoria y la entidad sean del owner;
--   * valida que cada comprobante asignado sea del owner;
--   * inserta payment y payment_allocation con owner_id explicito.
--
-- El trigger de la parte 1 sigue siendo la red de seguridad para cualquier
-- camino (incluido el insert directo).

create or replace function public.create_payment_with_allocations(
  p_entity_id uuid,
  p_direction payment_direction,
  p_payment_date date,
  p_amount numeric,
  p_method_id uuid,
  p_cash_account_id uuid,
  p_category_id uuid,
  p_reference text,
  p_notes text,
  p_allocations jsonb,
  p_is_cash_movement boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner          uuid := auth.uid();
  v_payment_id     uuid;
  v_item           jsonb;
  v_comprobante_id uuid;
  v_alloc_amount   numeric(12,2);
  v_total          numeric(12,2);
  v_paid           numeric(12,2);
  v_comp_owner     uuid;
begin
  if v_owner is null then
    raise exception 'Sesion no valida' using errcode = '42501';
  end if;

  if not exists (
       select 1 from public.cash_account a
        where a.id = p_cash_account_id and a.owner_id = v_owner)
  then
    raise exception 'La cuenta de caja no existe' using errcode = '42501';
  end if;

  if not exists (
       select 1 from public.payment_method m
        where m.id = p_method_id and m.owner_id = v_owner)
  then
    raise exception 'El metodo de pago no existe' using errcode = '42501';
  end if;

  if not exists (
       select 1 from public.cash_receipt_category c
        where c.id = p_category_id and c.owner_id = v_owner)
  then
    raise exception 'La categoria no existe' using errcode = '42501';
  end if;

  if p_entity_id is not null and not exists (
       select 1 from public.entidad e
        where e.id = p_entity_id and e.owner_id = v_owner)
  then
    raise exception 'La entidad no existe' using errcode = '42501';
  end if;

  insert into public.payment (
    owner_id, entity_id, direction, payment_date, amount,
    method_id, cash_account_id, category_id, reference, notes,
    is_cash_movement
  ) values (
    v_owner, p_entity_id, p_direction, p_payment_date, p_amount,
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

      select c.total, c.owner_id
        into v_total, v_comp_owner
        from public.comprobante c
       where c.id = v_comprobante_id
         for update;

      if v_total is null then
        raise exception 'El comprobante % no existe', v_comprobante_id;
      end if;

      if v_comp_owner is distinct from v_owner then
        raise exception 'El comprobante no pertenece al usuario'
          using errcode = '42501';
      end if;

      select coalesce(sum(a.amount), 0) into v_paid
        from public.payment_allocation a
        join public.payment p on p.id = a.payment_id
       where a.comprobante_id = v_comprobante_id
         and p.status <> 'ANULADO';

      if v_paid + v_alloc_amount > v_total then
        raise exception
          'La asignacion supera el saldo del comprobante (%)', v_comprobante_id;
      end if;

      insert into public.payment_allocation (
        owner_id, payment_id, comprobante_id, amount
      ) values (
        v_owner, v_payment_id, v_comprobante_id, v_alloc_amount
      );
    end loop;
  end if;

  return v_payment_id;
end;
$$;
