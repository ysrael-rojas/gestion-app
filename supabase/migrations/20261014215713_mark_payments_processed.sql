-- ===========================================================================
-- Migración: mark_payments_processed (SPEC 33)
-- ===========================================================================
-- 1) private.payment_guard_history_mutation: admite la transición
--    EN_REVISION -> PROCESADO (validación manual) sin tocar los invariantes de
--    SPEC 30.
-- 2) private.assert_payment_account_open: marcar verificado no cambia importes
--    ni fechas, así que no lo bloquea un período ya cerrado.
-- 3) Las funciones y la vista que suman lo pagado cuentan ahora
--    EN_REVISION + PROCESADO (solo ANULADO se excluye), para que marcar
--    verificado no altere el saldo ni el estado de los comprobantes.
-- 4) RPC mark_payments_processed(p_payment_ids uuid[]).
--
-- Las funciones se reproducen tal como las devuelve pg_get_functiondef, que es
-- exactamente lo aplicado en el proyecto.
-- ===========================================================================

CREATE OR REPLACE FUNCTION private.payment_guard_history_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  IF OLD.status = 'ANULADO' THEN
    RAISE EXCEPTION 'payment cannot be changed after voiding'
      USING ERRCODE = '23514';
  END IF;

  IF (to_jsonb(NEW) - ARRAY['entity_id', 'status', 'void_reason', 'voided_at', 'updated_at']::text[])
     IS DISTINCT FROM
     (to_jsonb(OLD) - ARRAY['entity_id', 'status', 'void_reason', 'voided_at', 'updated_at']::text[]) THEN
    RAISE EXCEPTION 'payment updates may only assign an entity, verify or void the payment'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.entity_id IS DISTINCT FROM OLD.entity_id THEN
    IF OLD.entity_id IS NOT NULL OR NEW.entity_id IS NULL THEN
      RAISE EXCEPTION 'payment entity can only be assigned once'
        USING ERRCODE = '23514';
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status
       OR NEW.void_reason IS DISTINCT FROM OLD.void_reason
       OR NEW.voided_at IS DISTINCT FROM OLD.voided_at THEN
      RAISE EXCEPTION 'payment assignment cannot be combined with voiding'
        USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'PROCESADO' THEN
      IF OLD.status <> 'EN_REVISION'
         OR NEW.void_reason IS DISTINCT FROM OLD.void_reason
         OR NEW.voided_at IS DISTINCT FROM OLD.voided_at THEN
        RAISE EXCEPTION 'payment status can only move from EN_REVISION to PROCESADO'
          USING ERRCODE = '23514';
      END IF;

      RETURN NEW;
    END IF;

    IF NEW.status <> 'ANULADO' OR OLD.status NOT IN ('EN_REVISION', 'PROCESADO') THEN
      RAISE EXCEPTION 'payment status can only transition once to ANULADO'
        USING ERRCODE = '23514';
    END IF;

    IF NEW.void_reason IS NULL OR NEW.voided_at IS NULL THEN
      RAISE EXCEPTION 'void_reason and voided_at are required when voiding a payment'
        USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
  END IF;

  IF NEW.void_reason IS DISTINCT FROM OLD.void_reason
     OR NEW.voided_at IS DISTINCT FROM OLD.voided_at THEN
    RAISE EXCEPTION 'payment void fields can only change during the void transition'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION private.assert_payment_account_open()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if tg_op = 'UPDATE'
     and old.status = 'EN_REVISION'
     and new.status = 'PROCESADO' then
    return new;
  end if;

  perform private.assert_account_open_for(new.cash_account_id, new.payment_date);
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_cash_position(p_cash_account_id uuid, p_as_of date DEFAULT CURRENT_DATE)
 RETURNS numeric
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select a.opening_balance
       + coalesce(sum(p.amount) filter (where p.direction = 'INGRESO'), 0)
       - coalesce(sum(p.amount) filter (where p.direction = 'EGRESO'),  0)
       + coalesce((select sum(t.amount) from public.cash_transfer t where t.target_account_id = p_cash_account_id and t.transfer_date <= p_as_of), 0)
       - coalesce((select sum(t.amount) from public.cash_transfer t where t.source_account_id = p_cash_account_id and t.transfer_date <= p_as_of), 0)
    from public.cash_account a
    left join public.payment p
      on p.cash_account_id = a.id
     and p.status <> 'ANULADO'
     and p.payment_date <= p_as_of
   where a.id = p_cash_account_id
   group by a.opening_balance;
$function$;

CREATE OR REPLACE FUNCTION public.close_cash_account(p_cash_account_id uuid, p_period_end date, p_counted_balance numeric, p_notes text, p_denominations jsonb DEFAULT NULL::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.create_payment_with_allocations(p_entity_id uuid, p_direction payment_direction, p_payment_date date, p_amount numeric, p_method_id uuid, p_cash_account_id uuid, p_category_id uuid, p_reference text, p_notes text, p_allocations jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION private.refresh_comprobante_status(p_comprobante_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_total numeric(12,2);
  v_paid  numeric(12,2);
begin
  select c.total into v_total from public.comprobante c where c.id = p_comprobante_id;

  select coalesce(sum(a.amount), 0) into v_paid
    from public.payment_allocation a
    join public.payment p on p.id = a.payment_id
   where a.comprobante_id = p_comprobante_id
     and p.status <> 'ANULADO';

  update public.comprobante
     set status = case when v_paid >= v_total
                       then 'PAGADO'::public.comprobante_status
                       else 'PENDIENTE'::public.comprobante_status end
   where id = p_comprobante_id;
end;
$function$;

CREATE OR REPLACE FUNCTION private.validate_allocation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
     and p.status <> 'ANULADO'
     and a.id <> new.id;

  if v_paid + new.amount > v_total then
    raise exception 'El importe asignado supera el saldo del comprobante';
  end if;

  return new;
end;
$function$;

create or replace view public.voucher_balance with (security_invoker=true) as
 SELECT c.id AS comprobante_id,
    c.entity_id,
    c.voucher_kind,
    c.voucher_type,
    c.voucher_number,
    c.issue_date,
    c.payment_type,
        CASE
            WHEN (c.payment_type = 'CREDITO'::payment_type) THEN c.due_date
            ELSE c.issue_date
        END AS effective_due_date,
    c.total,
    (COALESCE(sum(a.amount) FILTER (WHERE (p.status <> 'ANULADO'::payment_status)), (0)::numeric))::numeric(12,2) AS paid_amount,
    ((c.total - COALESCE(sum(a.amount) FILTER (WHERE (p.status <> 'ANULADO'::payment_status)), (0)::numeric)))::numeric(12,2) AS balance,
    c.status
   FROM ((comprobante c
     LEFT JOIN payment_allocation a ON ((a.comprobante_id = c.id)))
     LEFT JOIN payment p ON ((p.id = a.payment_id)))
  WHERE (c.deleted_at IS NULL)
  GROUP BY c.id;

create function public.mark_payments_processed(p_payment_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner     uuid := auth.uid();
  v_requested integer;
  v_valid     integer;
  v_updated   integer;
begin
  if p_payment_ids is null or array_length(p_payment_ids, 1) is null then
    raise exception 'Selecciona al menos un recibo para marcar';
  end if;

  select count(*) into v_requested from (select distinct unnest(p_payment_ids)) s;

  -- Bloquea los recibos seleccionados para que no cambien de estado en paralelo.
  perform p.id
    from public.payment p
   where p.id = any (p_payment_ids)
     and p.owner_id = v_owner
     and p.status = 'EN_REVISION'
     for update;

  select count(*) into v_valid
    from public.payment p
   where p.id = any (p_payment_ids)
     and p.owner_id = v_owner
     and p.status = 'EN_REVISION';

  if v_valid <> v_requested then
    raise exception 'Solo se pueden marcar recibos en revisión de tus cuentas';
  end if;

  update public.payment
     set status = 'PROCESADO'
   where id = any (p_payment_ids)
     and owner_id = v_owner
     and status = 'EN_REVISION';

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

revoke execute on function public.mark_payments_processed(uuid[]) from public, anon;
grant execute on function public.mark_payments_processed(uuid[]) to authenticated, service_role;
