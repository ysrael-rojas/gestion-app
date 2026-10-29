create or replace function public.get_cash_position(p_cash_account_id uuid, p_as_of date default current_date)
returns numeric
language sql
stable
set search_path = ''
as $$
  select a.opening_balance
       + coalesce(sum(p.amount) filter (where p.direction = 'INGRESO'), 0)
       - coalesce(sum(p.amount) filter (where p.direction = 'EGRESO'),  0)
    from public.cash_account a
    left join public.payment p
      on p.cash_account_id = a.id
     and p.status = 'EN_REVISION'
     and p.payment_date <= p_as_of
   where a.id = p_cash_account_id
   group by a.opening_balance;
$$;

create or replace function public.close_cash_account(p_cash_account_id uuid, p_period_end date, p_counted_balance numeric, p_notes text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner        uuid;
  v_currency     text;
  v_opening_bal  numeric(12,2);
  v_opening_date date;
  v_periodicity  public.closing_periodicity;
  v_default      public.closing_periodicity;
  v_last_end     date;
  v_period_start date;
  v_opening      numeric(12,2);
  v_income       numeric(12,2);
  v_expense      numeric(12,2);
  v_expected     numeric(12,2);
  v_rate         numeric(10,4);
  v_id           uuid;
begin
  select a.owner_id, a.currency, a.opening_balance, a.opening_balance_date,
         a.closing_periodicity
    into v_owner, v_currency, v_opening_bal, v_opening_date, v_periodicity
    from public.cash_account a
   where a.id = p_cash_account_id
     for update;

  if v_owner is null or v_owner is distinct from auth.uid() then
    raise exception 'La cuenta no existe';
  end if;

  if p_period_end < v_opening_date then
    raise exception
      'La fecha de cierre es anterior al saldo inicial de la cuenta (%)',
      v_opening_date;
  end if;

  select c.period_end into v_last_end
    from public.cash_close c
   where c.cash_account_id = p_cash_account_id
   order by c.period_end desc
   limit 1;

  if v_last_end is not null and p_period_end <= v_last_end then
    raise exception 'El período ya está cerrado hasta %', v_last_end;
  end if;

  v_period_start := coalesce(v_last_end + 1, v_opening_date);

  select value::public.closing_periodicity into v_default
    from public.app_setting
   where owner_id = v_owner and key = 'default_closing_periodicity';

  v_periodicity := coalesce(v_periodicity, v_default, 'DAILY');

  select v_opening_bal
       + coalesce(sum(amount) filter (where direction = 'INGRESO'), 0)
       - coalesce(sum(amount) filter (where direction = 'EGRESO'), 0)
    into v_opening
    from public.payment
   where cash_account_id = p_cash_account_id
     and status = 'EN_REVISION'
     and payment_date < v_period_start;

  select coalesce(sum(amount) filter (where direction = 'INGRESO'), 0),
         coalesce(sum(amount) filter (where direction = 'EGRESO'), 0)
    into v_income, v_expense
    from public.payment
   where cash_account_id = p_cash_account_id
     and status = 'EN_REVISION'
     and payment_date between v_period_start and p_period_end;

  v_expected := v_opening + v_income - v_expense;

  if v_currency <> 'PEN' then
    select value::numeric(10,4) into v_rate
      from public.app_setting
     where owner_id = v_owner and key = 'pen_usd_rate';
  end if;

  insert into public.cash_close (
    cash_account_id, periodicity, period_start, period_end,
    opening_balance, income_total, expense_total, expected_balance,
    counted_balance, difference, pen_usd_rate, notes
  ) values (
    p_cash_account_id, v_periodicity, v_period_start, p_period_end,
    v_opening, v_income, v_expense, v_expected,
    p_counted_balance,
    case when p_counted_balance is null then null
         else p_counted_balance - v_expected end,
    v_rate, nullif(p_notes, '')
  )
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.create_payment_with_allocations(p_entity_id uuid, p_direction payment_direction, p_payment_date date, p_amount numeric, p_method_id uuid, p_cash_account_id uuid, p_category_id uuid, p_reference text, p_notes text, p_allocations jsonb)
returns uuid
language plpgsql
security definer
set search_path to ''
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
    method_id, cash_account_id, category_id, reference, notes
  ) values (
    p_entity_id, p_direction, p_payment_date, p_amount,
    p_method_id, p_cash_account_id, p_category_id,
    nullif(p_reference, ''), nullif(p_notes, '')
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
         and p.status = 'EN_REVISION';

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

create or replace function private.refresh_comprobante_status(p_comprobante_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total numeric(12,2);
  v_paid  numeric(12,2);
begin
  select c.total into v_total from public.comprobante c where c.id = p_comprobante_id;

  select coalesce(sum(a.amount), 0) into v_paid
    from public.payment_allocation a
    join public.payment p on p.id = a.payment_id
   where a.comprobante_id = p_comprobante_id
     and p.status = 'EN_REVISION';

  update public.comprobante
     set status = case when v_paid >= v_total
                       then 'PAGADO'::public.comprobante_status
                       else 'PENDIENTE'::public.comprobante_status end
   where id = p_comprobante_id;
end;
$$;

create or replace function private.validate_allocation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total numeric(12,2);
  v_paid numeric(12,2);
  v_entity uuid;
  v_payment_entity uuid;
  v_kind public.voucher_kind;
  v_direction public.payment_direction;
begin
  select c.total, c.entity_id, c.voucher_kind into v_total, v_entity, v_kind
    from public.comprobante c
   where c.id = new.comprobante_id
     for update;

  select p.entity_id, p.direction into v_payment_entity, v_direction
    from public.payment p
   where p.id = new.payment_id;

  if v_payment_entity is null then
    raise exception 'El pago no tiene entidad asignada todavía';
  end if;

  if v_kind is null then
    raise exception 'El comprobante no existe';
  end if;

  if (v_kind = 'VENTA' and v_direction <> 'INGRESO')
     or (v_kind = 'COMPRA' and v_direction <> 'EGRESO') then
    raise exception 'El tipo de comprobante no corresponde a la dirección del pago';
  end if;

  if v_entity <> v_payment_entity then
    raise exception 'El comprobante no pertenece a la entidad del pago';
  end if;

  select coalesce(sum(a.amount), 0) into v_paid
    from public.payment_allocation a
    join public.payment p on p.id = a.payment_id
   where a.comprobante_id = new.comprobante_id
     and p.status = 'EN_REVISION'
     and a.id <> new.id;

  if v_paid + new.amount > v_total then
    raise exception 'El importe asignado supera el saldo del comprobante';
  end if;

  return new;
end;
$$;
