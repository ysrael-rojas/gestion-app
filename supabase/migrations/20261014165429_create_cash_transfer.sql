-- =========================================================================
-- Migración: create_cash_transfer (SPEC 31)
-- =========================================================================
-- Tabla `cash_transfer` para mover fondos entre cuentas de caja/banco como
-- una sola operación atómica (RPC `create_cash_transfer`), eliminando el
-- registro manual con dos recibos.
--
-- Incluye:
--   1) Tabla cash_transfer con RLS (solo SELECT/INSERT; inmutable).
--   2) Columnas transfer_in_total / transfer_out_total en cash_close.
--   3) RPC create_cash_transfer (valida cuentas activas, mismo dueño, PEN,
--      monto > 0 y período abierto; no inserta payment).
--   4) Ajuste de get_cash_position y close_cash_account para incluir
--      transferencias.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1) Tabla cash_transfer
-- -------------------------------------------------------------------------
create table public.cash_transfer (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null default auth.uid(),
  source_account_id uuid not null references public.cash_account (id),
  target_account_id uuid not null references public.cash_account (id),
  amount            numeric(12,2) not null,
  transfer_date     date not null default current_date,
  notes             text,
  created_at        timestamptz not null default now(),
  constraint cash_transfer_amount_positive   check (amount > 0),
  constraint cash_transfer_distinct_accounts check (source_account_id <> target_account_id)
);

create index cash_transfer_owner_date_idx on public.cash_transfer (owner_id, transfer_date desc);
create index cash_transfer_source_idx      on public.cash_transfer (source_account_id);
create index cash_transfer_target_idx      on public.cash_transfer (target_account_id);

alter table public.cash_transfer enable row level security;
create policy cash_transfer_select on public.cash_transfer
  for select to authenticated using (owner_id = auth.uid());
create policy cash_transfer_insert on public.cash_transfer
  for insert to authenticated with check (owner_id = auth.uid());

-- -------------------------------------------------------------------------
-- 2) Columnas de transferencias en cash_close
-- -------------------------------------------------------------------------
alter table public.cash_close
  add column transfer_in_total  numeric(12,2) not null default 0,
  add column transfer_out_total numeric(12,2) not null default 0;

-- -------------------------------------------------------------------------
-- 3) RPC create_cash_transfer
-- -------------------------------------------------------------------------
create function public.create_cash_transfer(
  p_source_account_id uuid,
  p_target_account_id uuid,
  p_amount            numeric,
  p_transfer_date     date,
  p_notes             text
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_owner           uuid;
  v_source_currency text;
  v_target_owner    uuid;
  v_target_currency text;
  v_id              uuid;
begin
  select a.owner_id, a.currency
    into v_owner, v_source_currency
    from public.cash_account a
   where a.id = p_source_account_id
     and a.is_active = true
     and a.deleted_at is null
     for update;

  if v_owner is null or v_owner is distinct from auth.uid() then
    raise exception 'La cuenta de origen no existe';
  end if;

  select a.owner_id, a.currency
    into v_target_owner, v_target_currency
    from public.cash_account a
   where a.id = p_target_account_id
     and a.is_active = true
     and a.deleted_at is null;

  if v_target_owner is null or v_target_owner is distinct from v_owner then
    raise exception 'La cuenta de destino no existe';
  end if;

  if p_source_account_id = p_target_account_id then
    raise exception 'Origen y destino deben ser cuentas distintas';
  end if;

  if v_source_currency <> 'PEN' or v_target_currency <> 'PEN' then
    raise exception 'Solo se permiten transferencias entre cuentas en PEN';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'El monto debe ser mayor a cero';
  end if;

  perform private.assert_account_open_for(p_source_account_id, p_transfer_date);
  perform private.assert_account_open_for(p_target_account_id, p_transfer_date);

  insert into public.cash_transfer (
    owner_id, source_account_id, target_account_id, amount, transfer_date, notes
  ) values (
    v_owner, p_source_account_id, p_target_account_id, p_amount,
    p_transfer_date, nullif(p_notes, '')
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.create_cash_transfer(uuid, uuid, numeric, date, text) from public, anon;
grant execute on function public.create_cash_transfer(uuid, uuid, numeric, date, text) to authenticated, service_role;

-- -------------------------------------------------------------------------
-- 4a) get_cash_position: incluye transferencias
-- -------------------------------------------------------------------------
create or replace function public.get_cash_position(
  p_cash_account_id uuid,
  p_as_of           date default current_date
) returns numeric
language sql stable security invoker set search_path = ''
as $$
  select a.opening_balance
       + coalesce(sum(p.amount) filter (where p.direction = 'INGRESO'), 0)
       - coalesce(sum(p.amount) filter (where p.direction = 'EGRESO'),  0)
       + coalesce((select sum(t.amount) from public.cash_transfer t where t.target_account_id = p_cash_account_id and t.transfer_date <= p_as_of), 0)
       - coalesce((select sum(t.amount) from public.cash_transfer t where t.source_account_id = p_cash_account_id and t.transfer_date <= p_as_of), 0)
    from public.cash_account a
    left join public.payment p
      on p.cash_account_id = a.id
     and p.status = 'EN_REVISION'
     and p.payment_date <= p_as_of
   where a.id = p_cash_account_id
   group by a.opening_balance;
$$;

-- -------------------------------------------------------------------------
-- 4b) close_cash_account: incluye transferencias
-- -------------------------------------------------------------------------
create or replace function public.close_cash_account(
  p_cash_account_id uuid,
  p_period_end      date,
  p_counted_balance numeric,
  p_notes           text
) returns uuid
language plpgsql security definer set search_path = ''
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
  v_transfer_in  numeric(12,2);
  v_transfer_out numeric(12,2);
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

  v_opening := v_opening
    + coalesce((select sum(t.amount) from public.cash_transfer t where t.target_account_id = p_cash_account_id and t.transfer_date < v_period_start), 0)
    - coalesce((select sum(t.amount) from public.cash_transfer t where t.source_account_id = p_cash_account_id and t.transfer_date < v_period_start), 0);

  select coalesce(sum(amount) filter (where direction = 'INGRESO'), 0),
         coalesce(sum(amount) filter (where direction = 'EGRESO'), 0)
    into v_income, v_expense
    from public.payment
   where cash_account_id = p_cash_account_id
     and status = 'EN_REVISION'
     and payment_date between v_period_start and p_period_end;

  v_transfer_in := coalesce((select sum(t.amount) from public.cash_transfer t where t.target_account_id = p_cash_account_id and t.transfer_date between v_period_start and p_period_end), 0);
  v_transfer_out := coalesce((select sum(t.amount) from public.cash_transfer t where t.source_account_id = p_cash_account_id and t.transfer_date between v_period_start and p_period_end), 0);

  v_expected := v_opening + v_income - v_expense + v_transfer_in - v_transfer_out;

  if v_currency <> 'PEN' then
    select value::numeric(10,4) into v_rate
      from public.app_setting
     where owner_id = v_owner and key = 'pen_usd_rate';
  end if;

  insert into public.cash_close (
    cash_account_id, periodicity, period_start, period_end,
    opening_balance, income_total, expense_total, expected_balance,
    transfer_in_total, transfer_out_total,
    counted_balance, difference, pen_usd_rate, notes
  ) values (
    p_cash_account_id, v_periodicity, v_period_start, p_period_end,
    v_opening, v_income, v_expense, v_expected,
    v_transfer_in, v_transfer_out,
    p_counted_balance,
    case when p_counted_balance is null then null
         else p_counted_balance - v_expected end,
    v_rate, nullif(p_notes, '')
  )
  returning id into v_id;

  return v_id;
end;
$$;
