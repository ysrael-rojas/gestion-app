-- SPEC 49 · Paso 3: arqueo sorpresivo (no cierra periodo)
create table public.cash_count (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null default auth.uid() references auth.users (id),
  cash_account_id  uuid not null references public.cash_account (id),
  count_date       date not null default current_date,
  counted_balance  numeric(12,2) not null,
  expected_balance numeric(12,2) not null,
  difference       numeric(12,2) not null,
  change_fund      numeric(12,2),
  counted_by       varchar(100),
  is_surprise      boolean not null default true,
  notes            text,
  created_at       timestamptz not null default now(),
  constraint cash_count_counted_check check (counted_balance >= 0)
);

create index cash_count_account_date_idx
  on public.cash_count (cash_account_id, count_date desc);

alter table public.cash_count enable row level security;

create policy cash_count_select on public.cash_count
  for select to authenticated using (owner_id = auth.uid());

-- Append-only para el cliente: escribe la RPC SECURITY DEFINER.
revoke insert, update, delete on table public.cash_count from anon, authenticated;
grant select on table public.cash_count to authenticated, service_role;

drop trigger if exists trg_cash_count_owner_id on public.cash_count;
create trigger trg_cash_count_owner_id
  before insert on public.cash_count
  for each row execute function public.set_owner_id_on_insert();

create table public.cash_count_denomination (
  id            uuid primary key default gen_random_uuid(),
  cash_count_id uuid not null references public.cash_count (id) on delete cascade,
  denomination  numeric(5,2) not null,
  quantity      integer not null,
  constraint cash_count_denomination_value_check
    check (denomination in (200, 100, 50, 20, 10, 5, 2, 1, 0.50, 0.20, 0.10)),
  constraint cash_count_denomination_quantity_check check (quantity >= 0),
  constraint cash_count_denomination_unique unique (cash_count_id, denomination)
);

alter table public.cash_count_denomination enable row level security;

create policy cash_count_denomination_select on public.cash_count_denomination
  for select to authenticated
  using (exists (
    select 1
      from public.cash_count c
     where c.id = cash_count_id
       and c.owner_id = auth.uid()
  ));

revoke insert, update, delete on table public.cash_count_denomination from anon, authenticated;
grant select on table public.cash_count_denomination to authenticated, service_role;

create function public.register_cash_count(
  p_cash_account_id uuid,
  p_count_date      date,
  p_counted_balance numeric,
  p_denominations   jsonb default null,
  p_counted_by      text default null,
  p_notes           text default null
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_owner        uuid;
  v_type         public.cash_account_type;
  v_opening_date date;
  v_change_fund  numeric(12,2);
  v_last_end     date;
  v_date         date;
  v_counted      numeric(12,2);
  v_expected     numeric(12,2);
  v_id           uuid;
begin
  select a.owner_id, a.type, a.opening_balance_date, a.change_fund
    into v_owner, v_type, v_opening_date, v_change_fund
    from public.cash_account a
   where a.id = p_cash_account_id
     and a.is_active = true
     and a.deleted_at is null
     for update;

  if v_owner is null or v_owner is distinct from auth.uid() then
    raise exception 'La cuenta no existe';
  end if;

  v_date := coalesce(p_count_date, current_date);

  if v_date < v_opening_date then
    raise exception
      'La fecha del arqueo es anterior al saldo inicial de la cuenta (%)',
      v_opening_date;
  end if;

  if v_date > current_date then
    raise exception 'La fecha del arqueo no puede ser futura (%)', v_date;
  end if;

  select max(c.period_end) into v_last_end
    from public.cash_close c
   where c.cash_account_id = p_cash_account_id;

  if v_last_end is not null and v_date <= v_last_end then
    raise exception
      'La fecha del arqueo cae en un periodo ya cerrado (hasta %)', v_last_end;
  end if;

  if p_denominations is not null and jsonb_typeof(p_denominations) = 'array' then
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

  if v_counted is null or v_counted < 0 then
    raise exception 'Indica el efectivo contado (mayor o igual a cero)';
  end if;

  v_expected := private.cash_expected_balance(p_cash_account_id, v_date);

  insert into public.cash_count (
    owner_id, cash_account_id, count_date, counted_balance, expected_balance,
    difference, change_fund, counted_by, is_surprise, notes
  ) values (
    v_owner, p_cash_account_id, v_date, v_counted, v_expected,
    v_counted - v_expected, v_change_fund, nullif(trim(p_counted_by), ''),
    true, nullif(trim(p_notes), '')
  )
  returning id into v_id;

  if p_denominations is not null and jsonb_typeof(p_denominations) = 'array' then
    insert into public.cash_count_denomination (cash_count_id, denomination, quantity)
    select v_id, (e ->> 'denomination')::numeric, (e ->> 'quantity')::integer
      from jsonb_array_elements(p_denominations) e
     where (e ->> 'quantity')::integer > 0;
  end if;

  return v_id;
end;
$$;

revoke execute on function public.register_cash_count(uuid, date, numeric, jsonb, text, text) from public, anon;
grant execute on function public.register_cash_count(uuid, date, numeric, jsonb, text, text) to authenticated, service_role;
