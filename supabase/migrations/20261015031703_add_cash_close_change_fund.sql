-- =========================================================================
-- Migración: add_cash_close_change_fund (SPEC 35)
-- =========================================================================
-- Congela el fondo de cambio vigente de la cuenta al momento de cerrar.
--
-- Incluye:
--   1) Columna cash_close.change_fund numeric(12,2) nullable (los cierres
--      históricos quedan en NULL y el reporte cae al valor actual).
--   2) close_cash_account copia cash_account.change_fund en el cierre.
--      La firma y los argumentos no cambian.
-- =========================================================================

alter table public.cash_close
  add column change_fund numeric(12,2);

create or replace function public.close_cash_account(
  p_cash_account_id uuid,
  p_period_end      date,
  p_counted_balance numeric,
  p_notes           text,
  p_denominations   jsonb default null
) returns uuid
language plpgsql security definer set search_path = ''
as $function$
declare
  v_owner        uuid;
  v_currency     text;
  v_type         public.cash_account_type;
  v_opening_bal  numeric(12,2);
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
  v_change_fund  numeric(12,2);
  v_rate         numeric(10,4);
  v_id           uuid;
begin
  select a.owner_id, a.currency, a.type, a.opening_balance,
         a.opening_balance_date, a.closing_periodicity, a.change_fund
    into v_owner, v_currency, v_type, v_opening_bal, v_opening_date, v_periodicity, v_change_fund
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
    raise exception 'El periodo ya esta cerrado hasta %', v_last_end;
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
     and status <> 'ANULADO'
     and payment_date < v_period_start;

  v_opening := v_opening
    + coalesce((select sum(t.amount) from public.cash_transfer t where t.target_account_id = p_cash_account_id and t.transfer_date < v_period_start), 0)
    - coalesce((select sum(t.amount) from public.cash_transfer t where t.source_account_id = p_cash_account_id and t.transfer_date < v_period_start), 0);

  select coalesce(sum(amount) filter (where direction = 'INGRESO'), 0),
         coalesce(sum(amount) filter (where direction = 'EGRESO'), 0)
    into v_income, v_expense
    from public.payment
   where cash_account_id = p_cash_account_id
     and status <> 'ANULADO'
     and payment_date between v_period_start and p_period_end;

  v_transfer_in := coalesce((select sum(t.amount) from public.cash_transfer t where t.target_account_id = p_cash_account_id and t.transfer_date between v_period_start and p_period_end), 0);
  v_transfer_out := coalesce((select sum(t.amount) from public.cash_transfer t where t.source_account_id = p_cash_account_id and t.transfer_date between v_period_start and p_period_end), 0);

  v_expected := v_opening + v_income - v_expense + v_transfer_in - v_transfer_out;

  -- Conteo por denominaciones: solo cajas. En bancos se ignora y se usa
  -- el saldo contado enviado por el cliente.
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

  if v_currency <> 'PEN' then
    select value::numeric(10,4) into v_rate
      from public.app_setting
     where owner_id = v_owner and key = 'pen_usd_rate';
  end if;

  insert into public.cash_close (
    cash_account_id, periodicity, period_start, period_end,
    opening_balance, income_total, expense_total, expected_balance,
    transfer_in_total, transfer_out_total,
    counted_balance, difference, pen_usd_rate, notes, change_fund
  ) values (
    p_cash_account_id, v_periodicity, v_period_start, p_period_end,
    v_opening, v_income, v_expense, v_expected,
    v_transfer_in, v_transfer_out,
    v_counted,
    case when v_counted is null then null else v_counted - v_expected end,
    v_rate, nullif(p_notes, ''), v_change_fund
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
$function$;
