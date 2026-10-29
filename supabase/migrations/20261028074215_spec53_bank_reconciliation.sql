-- =========================================================================
-- Migración: spec53_bank_reconciliation (SPEC 53, paso 1)
-- =========================================================================
-- Conciliación bancaria formal por cuenta y período.
-- 1) Enum reconciliation_item_kind con el signo del formato oficial.
-- 2) bank_reconciliation (cabecera) + bank_reconciliation_item (partidas).
-- 3) RLS de solo lectura para el owner; escribe la RPC SECURITY DEFINER.
-- 4) save_bank_reconciliation: upsert de cabecera + reemplazo de partidas en
--    una sola transacción. Valida dueño, tipo de cuenta y período.
-- =========================================================================

do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'reconciliation_item_kind'
  ) then
    create type public.reconciliation_item_kind as enum (
      'DEPOSITO_EN_TRANSITO',
      'PAGO_NO_DEBITADO',
      'CARGO_NO_REGISTRADO',
      'ABONO_NO_REGISTRADO'
    );
  end if;
end
$$;

create table if not exists public.bank_reconciliation (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null default auth.uid()
                      references auth.users (id) on delete cascade,
  cash_account_id   uuid not null references public.cash_account (id),
  period_start      date not null,
  period_end        date not null,
  statement_balance numeric(12,2) not null,
  books_balance     numeric(12,2) not null,
  prepared_by       varchar(100),
  reviewed_by       varchar(100),
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint bank_reconciliation_period_unique
    unique (cash_account_id, period_start, period_end),
  constraint bank_reconciliation_period_check
    check (period_end >= period_start)
);

create index if not exists bank_reconciliation_owner_idx
  on public.bank_reconciliation (owner_id);

create table if not exists public.bank_reconciliation_item (
  id                uuid primary key default gen_random_uuid(),
  reconciliation_id uuid not null
                      references public.bank_reconciliation (id) on delete cascade,
  kind              public.reconciliation_item_kind not null,
  description       text not null,
  amount            numeric(12,2) not null,
  created_at        timestamptz not null default now(),
  constraint bank_reconciliation_item_amount_check check (amount > 0),
  constraint bank_reconciliation_item_description_check
    check (char_length(btrim(description)) >= 1)
);

create index if not exists bank_reconciliation_item_parent_idx
  on public.bank_reconciliation_item (reconciliation_id);

alter table public.bank_reconciliation enable row level security;
alter table public.bank_reconciliation_item enable row level security;

create policy bank_reconciliation_select on public.bank_reconciliation
  for select to authenticated
  using (owner_id = (select auth.uid()));

create policy bank_reconciliation_item_select on public.bank_reconciliation_item
  for select to authenticated
  using (exists (
    select 1
      from public.bank_reconciliation r
     where r.id = reconciliation_id
       and r.owner_id = (select auth.uid())
  ));

revoke insert, update, delete
  on table public.bank_reconciliation from anon, authenticated;
revoke insert, update, delete
  on table public.bank_reconciliation_item from anon, authenticated;

grant select on table public.bank_reconciliation to authenticated, service_role;
grant select on table public.bank_reconciliation_item to authenticated, service_role;

create trigger bank_reconciliation_set_updated_at
  before update on public.bank_reconciliation
  for each row execute function public.set_updated_at();

create trigger trg_bank_reconciliation_owner_id
  before insert on public.bank_reconciliation
  for each row execute function public.set_owner_id_on_insert();

create or replace function public.save_bank_reconciliation(
  p_reconciliation jsonb,
  p_items          jsonb default '[]'::jsonb
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_owner       uuid;
  v_type        public.cash_account_type;
  v_account     uuid;
  v_start       date;
  v_end         date;
  v_statement   numeric(12,2);
  v_books       numeric(12,2);
  v_id          uuid;
  v_item        jsonb;
  v_kind        public.reconciliation_item_kind;
  v_description text;
  v_amount      numeric(12,2);
begin
  v_account   := (p_reconciliation ->> 'cash_account_id')::uuid;
  v_start     := (p_reconciliation ->> 'period_start')::date;
  v_end       := (p_reconciliation ->> 'period_end')::date;
  v_statement := (p_reconciliation ->> 'statement_balance')::numeric(12,2);
  v_books     := (p_reconciliation ->> 'books_balance')::numeric(12,2);

  if v_account is null then
    raise exception 'Indica la cuenta bancaria a conciliar';
  end if;

  select a.owner_id, a.type
    into v_owner, v_type
    from public.cash_account a
   where a.id = v_account
     and a.deleted_at is null
     for update;

  if v_owner is null or v_owner is distinct from auth.uid() then
    raise exception 'La cuenta no existe';
  end if;

  if v_type <> 'BANK_ACCOUNT' then
    raise exception 'Solo se concilian cuentas bancarias';
  end if;

  if v_start is null or v_end is null or v_end < v_start then
    raise exception 'El período de la conciliación no es válido';
  end if;

  if v_statement is null or v_books is null then
    raise exception 'Indica el saldo según extracto y el saldo según registros';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    p_items := '[]'::jsonb;
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    begin
      v_kind   := (v_item ->> 'kind')::public.reconciliation_item_kind;
      v_amount := (v_item ->> 'amount')::numeric(12,2);
    exception
      when invalid_text_representation or numeric_value_out_of_range then
        raise exception 'Hay una partida con una clase o un monto inválido';
    end;

    v_description := nullif(btrim(v_item ->> 'description'), '');

    if v_description is null then
      raise exception 'Cada partida necesita una descripción';
    end if;

    if v_amount is null or v_amount <= 0 then
      raise exception 'El monto de cada partida debe ser mayor a cero';
    end if;
  end loop;

  insert into public.bank_reconciliation (
    owner_id, cash_account_id, period_start, period_end,
    statement_balance, books_balance, prepared_by, reviewed_by, notes
  ) values (
    v_owner, v_account, v_start, v_end,
    v_statement, v_books,
    nullif(btrim(p_reconciliation ->> 'prepared_by'), ''),
    nullif(btrim(p_reconciliation ->> 'reviewed_by'), ''),
    nullif(btrim(p_reconciliation ->> 'notes'), '')
  )
  on conflict (cash_account_id, period_start, period_end) do update
    set statement_balance = excluded.statement_balance,
        books_balance     = excluded.books_balance,
        prepared_by       = excluded.prepared_by,
        reviewed_by       = excluded.reviewed_by,
        notes             = excluded.notes,
        updated_at        = now()
  returning id into v_id;

  delete from public.bank_reconciliation_item
   where reconciliation_id = v_id;

  insert into public.bank_reconciliation_item (
    reconciliation_id, kind, description, amount
  )
  select v_id,
         (e ->> 'kind')::public.reconciliation_item_kind,
         btrim(e ->> 'description'),
         (e ->> 'amount')::numeric(12,2)
    from jsonb_array_elements(p_items) e;

  return v_id;
end;
$$;

revoke execute on function public.save_bank_reconciliation(jsonb, jsonb)
  from public, anon;
grant execute on function public.save_bank_reconciliation(jsonb, jsonb)
  to authenticated, service_role;
