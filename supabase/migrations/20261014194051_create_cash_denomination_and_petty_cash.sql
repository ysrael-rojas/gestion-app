-- =========================================================================
-- Migración: create_cash_denomination_and_petty_cash (SPEC 32)
-- =========================================================================
-- 1) Arqueo por denominaciones: tabla hija de cash_close (inmutable).
-- 2) Caja chica: columnas nuevas en cash_account + tabla petty_cash_vale.
-- 3) Enum vale_status.
-- 4) RPC close_cash_account con p_denominations jsonb opcional.
-- 5) RPC create_petty_cash_vale / void_petty_cash_vale / replenish_petty_cash.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1) Enum vale_status
-- -------------------------------------------------------------------------
create type public.vale_status as enum ('PENDIENTE', 'REPUESTO', 'ANULADO');

-- -------------------------------------------------------------------------
-- 2) Arqueo por denominaciones
-- -------------------------------------------------------------------------
-- Detalle del conteo físico ligado al cierre. Sin owner_id: la pertenencia se
-- hereda del cierre padre (cash_close.owner_id) y el detalle es inmutable.
create table public.cash_close_denomination (
  id            uuid primary key default gen_random_uuid(),
  cash_close_id uuid not null references public.cash_close (id) on delete cascade,
  denomination  numeric(5,2) not null,
  quantity      integer not null,
  constraint cash_close_denomination_value_check
    check (denomination in (200, 100, 50, 20, 10, 5, 2, 1, 0.50, 0.20, 0.10)),
  constraint cash_close_denomination_quantity_check check (quantity >= 0),
  constraint cash_close_denomination_unique unique (cash_close_id, denomination)
);
-- El unique (cash_close_id, denomination) ya indexa por cash_close_id.

alter table public.cash_close_denomination enable row level security;

create policy cash_close_denomination_select on public.cash_close_denomination
  for select to authenticated
  using (exists (
    select 1
      from public.cash_close c
     where c.id = cash_close_id
       and c.owner_id = auth.uid()
  ));

-- Solo lectura para el cliente: escribe la RPC SECURITY DEFINER.
revoke insert, update, delete on table public.cash_close_denomination from anon, authenticated;
grant select on table public.cash_close_denomination to authenticated, service_role;

-- -------------------------------------------------------------------------
-- 3) Caja chica: columnas en cash_account
-- -------------------------------------------------------------------------
alter table public.cash_account
  add column is_petty_cash       boolean not null default false,
  add column change_fund         numeric(12,2) not null default 0,
  add column petty_expense_limit numeric(12,2),
  add column custodian_name      varchar(100);

alter table public.cash_account
  add constraint cash_account_change_fund_check check (change_fund >= 0),
  add constraint cash_account_petty_expense_limit_check
    check (petty_expense_limit is null or petty_expense_limit > 0),
  add constraint cash_account_petty_cash_type_check
    check (not is_petty_cash or type = 'CASH_BOX');

-- -------------------------------------------------------------------------
-- 4) Vales de caja chica
-- -------------------------------------------------------------------------
-- Vales prenumerados por cuenta. El serial lo asigna la RPC con la fila de
-- cash_account bloqueada (for update), nunca el cliente.
create table public.petty_cash_vale (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid(),
  account_id  uuid not null references public.cash_account (id),
  serial      integer not null,
  vale_date   date not null default current_date,
  paid_to     varchar(200) not null,
  concept     varchar(300) not null,
  amount      numeric(12,2) not null,
  has_receipt boolean not null default false,
  status      public.vale_status not null default 'PENDIENTE',
  created_at  timestamptz not null default now(),
  constraint petty_cash_vale_amount_check check (amount > 0),
  constraint petty_cash_vale_serial_check check (serial > 0),
  constraint petty_cash_vale_serial_unique unique (account_id, serial)
);

alter table public.petty_cash_vale enable row level security;

create policy petty_cash_vale_select on public.petty_cash_vale
  for select to authenticated using (owner_id = auth.uid());

-- Append-only para el cliente: crear/anular/reponer pasan por RPC.
revoke insert, update, delete on table public.petty_cash_vale from anon, authenticated;
grant select on table public.petty_cash_vale to authenticated, service_role;

drop trigger if exists trg_petty_cash_vale_owner_id on public.petty_cash_vale;
create trigger trg_petty_cash_vale_owner_id
  before insert on public.petty_cash_vale
  for each row execute function public.set_owner_id_on_insert();

-- -------------------------------------------------------------------------
-- 5) close_cash_account: conteo por denominaciones (cajas)
-- -------------------------------------------------------------------------
-- Se elimina la versión de 4 argumentos y se recrea con p_denominations
-- opcional (default null) para no dejar sobrecargas ambiguas.
drop function if exists public.close_cash_account(uuid, date, numeric, text);

create function public.close_cash_account(
  p_cash_account_id uuid,
  p_period_end      date,
  p_counted_balance numeric,
  p_notes           text,
  p_denominations   jsonb default null
) returns uuid
language plpgsql security definer set search_path = ''
as $$
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
  v_rate         numeric(10,4);
  v_id           uuid;
begin
  select a.owner_id, a.currency, a.type, a.opening_balance,
         a.opening_balance_date, a.closing_periodicity
    into v_owner, v_currency, v_type, v_opening_bal, v_opening_date, v_periodicity
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

  -- Conteo por denominaciones: solo cajas. En bancos se ignora y se usa el
  -- saldo contado enviado por el cliente.
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
        raise exception 'El conteo por denominaciones tiene montos o cantidades inválidas';
    end;

    if exists (
      select 1
        from jsonb_array_elements(p_denominations) e
       where (e ->> 'denomination')::numeric not in (200, 100, 50, 20, 10, 5, 2, 1, 0.50, 0.20, 0.10)
          or (e ->> 'quantity')::integer < 0
    ) then
      raise exception 'Denominación o cantidad inválida en el arqueo';
    end if;

    if (select count(*) from jsonb_array_elements(p_denominations))
       <> (select count(distinct (e ->> 'denomination')::numeric)
             from jsonb_array_elements(p_denominations) e) then
      raise exception 'No se puede repetir una denominación en el arqueo';
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
    counted_balance, difference, pen_usd_rate, notes
  ) values (
    p_cash_account_id, v_periodicity, v_period_start, p_period_end,
    v_opening, v_income, v_expense, v_expected,
    v_transfer_in, v_transfer_out,
    v_counted,
    case when v_counted is null then null else v_counted - v_expected end,
    v_rate, nullif(p_notes, '')
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

revoke execute on function public.close_cash_account(uuid, date, numeric, text, jsonb) from public, anon;
grant execute on function public.close_cash_account(uuid, date, numeric, text, jsonb) to authenticated, service_role;

-- -------------------------------------------------------------------------
-- 6) create_petty_cash_vale
-- -------------------------------------------------------------------------
create function public.create_petty_cash_vale(
  p_account_id  uuid,
  p_vale_date   date,
  p_paid_to     varchar,
  p_concept     varchar,
  p_amount      numeric,
  p_has_receipt boolean
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_owner    uuid;
  v_is_petty boolean;
  v_limit    numeric(12,2);
  v_date     date;
  v_serial   integer;
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

  return v_id;
end;
$$;

revoke execute on function public.create_petty_cash_vale(uuid, date, varchar, varchar, numeric, boolean) from public, anon;
grant execute on function public.create_petty_cash_vale(uuid, date, varchar, varchar, numeric, boolean) to authenticated, service_role;

-- -------------------------------------------------------------------------
-- 7) void_petty_cash_vale
-- -------------------------------------------------------------------------
create function public.void_petty_cash_vale(p_vale_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_status public.vale_status;
begin
  select v.status into v_status
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
end;
$$;

revoke execute on function public.void_petty_cash_vale(uuid) from public, anon;
grant execute on function public.void_petty_cash_vale(uuid) to authenticated, service_role;

-- -------------------------------------------------------------------------
-- 8) replenish_petty_cash
-- -------------------------------------------------------------------------
-- Repone el fondo: crea la transferencia atómica (SPEC 31) desde la cuenta de
-- origen por el total de los vales seleccionados y los marca como REPUESTO.
create function public.replenish_petty_cash(
  p_account_id        uuid,
  p_source_account_id uuid,
  p_vale_ids          uuid[]
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_owner       uuid;
  v_is_petty    boolean;
  v_selected    integer;
  v_requested   integer;
  v_total       numeric(12,2);
  v_serials     text;
  v_transfer_id uuid;
begin
  if p_vale_ids is null or array_length(p_vale_ids, 1) is null then
    raise exception 'Selecciona al menos un vale para reponer';
  end if;

  select a.owner_id, a.is_petty_cash
    into v_owner, v_is_petty
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

  perform v.id
    from public.petty_cash_vale v
   where v.id = any (p_vale_ids)
     and v.account_id = p_account_id
     for update;

  select count(*), coalesce(sum(v.amount), 0),
         string_agg(v.serial::text, ', ' order by v.serial)
    into v_selected, v_total, v_serials
    from public.petty_cash_vale v
   where v.id = any (p_vale_ids)
     and v.account_id = p_account_id
     and v.status = 'PENDIENTE';

  select count(*) into v_requested from (select distinct unnest(p_vale_ids)) s;

  if v_selected <> v_requested then
    raise exception 'Algún vale no existe, no pertenece a la caja chica o no está pendiente';
  end if;

  if v_total <= 0 then
    raise exception 'El total de los vales debe ser mayor a cero';
  end if;

  v_transfer_id := public.create_cash_transfer(
    p_source_account_id,
    p_account_id,
    v_total,
    current_date,
    format('Reposición de caja chica (vales %s)', v_serials)
  );

  update public.petty_cash_vale
     set status = 'REPUESTO'
   where id = any (p_vale_ids)
     and account_id = p_account_id
     and status = 'PENDIENTE';

  return v_transfer_id;
end;
$$;

revoke execute on function public.replenish_petty_cash(uuid, uuid, uuid[]) from public, anon;
grant execute on function public.replenish_petty_cash(uuid, uuid, uuid[]) to authenticated, service_role;
