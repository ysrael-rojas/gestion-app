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
  insert into public.payment (
    entity_id, direction, payment_date, amount, method, reference, notes,
    receipt_year, receipt_serial
  ) values (
    p_entity_id, p_direction, p_payment_date, p_amount, p_method,
    nullif(p_reference, ''), nullif(p_notes, ''),
    0, 0
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
