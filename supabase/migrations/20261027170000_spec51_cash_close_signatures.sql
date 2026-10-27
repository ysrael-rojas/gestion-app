-- =========================================================================
-- Migración: spec51_cash_close_signatures (SPEC 51, paso 1)
-- =========================================================================
-- El acta de arqueo imprime la doble firma (cajero y arqueador).
-- 1) cash_close.counted_by / verified_by (nullable; cierres históricos en null).
-- 2) close_cash_account gana p_counted_by y p_verified_by (default null) al
--    final. Se elimina la firma de 6 argumentos para no dejar sobrecargas
--    ambiguas. El resto de la lógica (saldo esperado, tolerancia, motivo) no
--    cambia respecto de SPEC 49.
-- =========================================================================

alter table public.cash_close
  add column counted_by  varchar(100),
  add column verified_by varchar(100);

drop function if exists public.close_cash_account(uuid, date, numeric, text, jsonb, text);

create function public.close_cash_account(
  p_cash_account_id   uuid,
  p_period_end        date,
  p_counted_balance   numeric,
  p_notes             text,
  p_denominations     jsonb default null,
  p_difference_reason text default null,
  p_counted_by        text default null,
  p_verified_by       text default null
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_owner        uuid;
  v_currency     text;
  v_type         public.cash_account_type;
  v_opening_date date;
  v_periodicity  public.closing_periodicity;
  v_default      public.closing_periodicity;
  v_last_end     date;
  v_period_start date;
  v_opening      numeric(12,2);
  v_income       numeric(12,2);
  v_expense      numeric(12,2);
  v_transfer_in  numeric(12,2);
  v_transfer_out numeric(12,2);
  v_expected     numeric(12,2);
  v_counted      numeric(12,2);
  v_difference   numeric(12,2);
  v_tolerance    numeric(12,2);
  v_reason       text;
  v_change_fund  numeric(12,2);
  v_rate         numeric(10,4);
  v_id           uuid;
begin
  select a.owner_id, a.currency, a.type,
         a.opening_balance_date, a.closing_periodicity, a.change_fund
    into v_owner, v_currency, v_type,
         v_opening_date, v_periodicity, v_change_fund
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

  -- SPEC 49: no se puede cerrar el futuro.
  if p_period_end > current_date then
    raise exception
      'La fecha de cierre no puede ser futura (%). Usa hoy o una fecha anterior',
      p_period_end;
  end if;

  select c.period_end into v_last_end
    from public.cash_close c
   where c.cash_account_id = p_cash_account_id
   order by c.period_end desc
   limit 1;

  if v_last_end is not null and p_period_end <= v_last_end then
    raise exception 'El periodo ya esta cerrado hasta %', v_last_end;
  end if;

  v_period_start := coalesce(v_last_end + 1, v_opening_date);

  select value::public.closing_periodicity into v_default
    from public.app_setting
   where owner_id = v_owner and key = 'default_closing_periodicity';

  v_periodicity := coalesce(v_periodicity, v_default, 'DAILY');

  v_opening := private.cash_expected_balance(
    p_cash_account_id, v_period_start - 1
  );
  v_expected := private.cash_expected_balance(p_cash_account_id, p_period_end);

  select coalesce(sum(amount) filter (where direction = 'INGRESO'), 0),
         coalesce(sum(amount) filter (where direction = 'EGRESO'), 0)
    into v_income, v_expense
    from public.payment
   where cash_account_id = p_cash_account_id
     and status <> 'ANULADO'
     and payment_date between v_period_start and p_period_end;

  v_transfer_in := coalesce((select sum(t.amount) from public.cash_transfer t where t.target_account_id = p_cash_account_id and t.transfer_date between v_period_start and p_period_end), 0);
  v_transfer_out := coalesce((select sum(t.amount) from public.cash_transfer t where t.source_account_id = p_cash_account_id and t.transfer_date between v_period_start and p_period_end), 0);

  select coalesce(
           (select s.value::numeric(12,2)
              from public.app_setting s
             where s.owner_id = v_owner
               and s.key = 'cash_difference_tolerance'),
           0.50)
    into v_tolerance;

  if p_denominations is not null and v_type = 'CASH_BOX' then
    if jsonb_typeof(p_denominations) <> 'array' then
      raise exception 'El conteo por denominaciones debe ser un arreglo';
    end if;

    begin
      select coalesce(sum((e ->> 'denomination')::numeric * (e ->> 'quantity')::integer), 0)
        into v_counted
        from jsonb_array_elements(p_denominations) e;
    exception
      when invalid_text_representation or numeric_value_out_of_range then
        raise exception 'El conteo por denominaciones tiene montos o cantidades invalidas';
    end;

    if exists (
      select 1
        from jsonb_array_elements(p_denominations) e
       where (e ->> 'denomination')::numeric not in (200, 100, 50, 20, 10, 5, 2, 1, 0.50, 0.20, 0.10)
          or (e ->> 'quantity')::integer < 0
    ) then
      raise exception 'Denominacion o cantidad invalida en el arqueo';
    end if;

    if (select count(*) from jsonb_array_elements(p_denominations))
       <> (select count(distinct (e ->> 'denomination')::numeric)
             from jsonb_array_elements(p_denominations) e) then
      raise exception 'No se puede repetir una denominacion en el arqueo';
    end if;
  else
    v_counted := p_counted_balance;
  end if;

  v_difference := case when v_counted is null then null else v_counted - v_expected end;
  v_reason := nullif(trim(coalesce(p_difference_reason, '')), '');

  if v_difference is not null
     and abs(v_difference) > v_tolerance
     and v_reason is null then
    raise exception
      'La diferencia (%) supera la tolerancia (%). Registra el motivo de la diferencia',
      v_difference, v_tolerance;
  end if;

  if v_currency <> 'PEN' then
    select value::numeric(10,4) into v_rate
      from public.app_setting
     where owner_id = v_owner and key = 'pen_usd_rate';
  end if;

  insert into public.cash_close (
    cash_account_id, periodicity, period_start, period_end,
    opening_balance, income_total, expense_total, expected_balance,
    transfer_in_total, transfer_out_total,
    counted_balance, difference, difference_reason, difference_tolerance,
    pen_usd_rate, notes, change_fund, counted_by, verified_by
  ) values (
    p_cash_account_id, v_periodicity, v_period_start, p_period_end,
    v_opening, v_income, v_expense, v_expected,
    v_transfer_in, v_transfer_out,
    v_counted, v_difference, v_reason, v_tolerance,
    v_rate, nullif(p_notes, ''), v_change_fund,
    nullif(trim(coalesce(p_counted_by, '')), ''),
    nullif(trim(coalesce(p_verified_by, '')), '')
  )
  returning id into v_id;

  if p_denominations is not null and v_type = 'CASH_BOX' then
    insert into public.cash_close_denomination (cash_close_id, denomination, quantity)
    select v_id, (e ->> 'denomination')::numeric, (e ->> 'quantity')::integer
      from jsonb_array_elements(p_denominations) e
     where (e ->> 'quantity')::integer > 0;
  end if;

  return v_id;
end;
$$;

revoke execute on function public.close_cash_account(uuid, date, numeric, text, jsonb, text, text, text) from public, anon;
grant execute on function public.close_cash_account(uuid, date, numeric, text, jsonb, text, text, text) to authenticated, service_role;
