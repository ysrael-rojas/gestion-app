-- SPEC 39: notas de credito/debito y comprobante de retencion.
--
-- Los ajustes viven en la misma tabla comprobante: referencian al comprobante que
-- corrigen (referenced_comprobante_id) y llevan motivo SUNAT cuando son notas
-- (motive_code). El saldo del referenciado se ajusta en voucher_balance (NC y
-- retencion = credito; ND = debito) y las filas de ajuste no aparecen en la vista
-- porque no son cobrables ni pagables. Aplicada via MCP el 2026-10-17.

-- 1) Columnas de referencia y motivo.
alter table public.comprobante
  add column if not exists referenced_comprobante_id uuid references public.comprobante(id);
alter table public.comprobante
  add column if not exists motive_code text;

-- 2) Consistencia por tipo: las notas exigen referencia y motivo; la retencion
--    exige referencia y motivo nulo; los tipos base no llevan ninguno de los dos.
alter table public.comprobante
  drop constraint if exists comprobante_ajuste_check;
alter table public.comprobante
  add constraint comprobante_ajuste_check check (
    case
      when voucher_type in ('NOTA_CREDITO', 'NOTA_DEBITO') then
        referenced_comprobante_id is not null and motive_code is not null
      when voucher_type = 'COMPROBANTE_RETENCION' then
        referenced_comprobante_id is not null and motive_code is null
      else
        referenced_comprobante_id is null and motive_code is null
    end
  );

-- 3) Indice parcial para el join de la vista y los listados de notas.
create index if not exists comprobante_referenced_idx
  on public.comprobante (referenced_comprobante_id)
  where referenced_comprobante_id is not null;

-- 4) Integridad de la referencia: existe, es del mismo dueno y tipo (venta/compra)
--    y es un comprobante base (una nota no referencia otra nota). En UPDATE de una
--    nota, referencia, tipo y kind no cambian.
create or replace function private.validate_comprobante_adjustment()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_ref public.comprobante%rowtype;
begin
  if tg_op = 'UPDATE'
     and (old.voucher_type in ('NOTA_CREDITO', 'NOTA_DEBITO', 'COMPROBANTE_RETENCION')
          or new.voucher_type in ('NOTA_CREDITO', 'NOTA_DEBITO', 'COMPROBANTE_RETENCION'))
     and (new.referenced_comprobante_id is distinct from old.referenced_comprobante_id
          or new.voucher_type is distinct from old.voucher_type
          or new.voucher_kind is distinct from old.voucher_kind) then
    raise exception 'La referencia y el tipo de una nota o retencion no se pueden cambiar';
  end if;

  if new.voucher_type not in ('NOTA_CREDITO', 'NOTA_DEBITO', 'COMPROBANTE_RETENCION') then
    return new;
  end if;

  select * into v_ref
    from public.comprobante c
   where c.id = new.referenced_comprobante_id;

  if not found then
    raise exception 'El comprobante referenciado no existe';
  end if;

  if v_ref.owner_id <> new.owner_id then
    raise exception 'El comprobante referenciado es de otro usuario';
  end if;

  if v_ref.voucher_kind <> new.voucher_kind then
    raise exception 'El comprobante referenciado no es del mismo tipo (venta o compra)';
  end if;

  if v_ref.voucher_type not in ('FACTURA', 'BOLETA', 'NOTA_VENTA') then
    raise exception 'Una nota o retencion solo puede referenciar factura, boleta o nota de venta';
  end if;

  return new;
end;
$function$;

drop trigger if exists comprobante_validate_adjustment on public.comprobante;
create trigger comprobante_validate_adjustment
  before insert or update on public.comprobante
  for each row
  execute function private.validate_comprobante_adjustment();

-- 5) El estado del comprobante considera creditos y debitos:
--    PAGADO cuando pagos + creditos >= total + debitos.
create or replace function private.refresh_comprobante_status(p_comprobante_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_total  numeric(12,2);
  v_paid   numeric(12,2);
  v_credit numeric(12,2);
  v_debit  numeric(12,2);
begin
  select c.total into v_total from public.comprobante c where c.id = p_comprobante_id;

  select coalesce(sum(a.amount), 0) into v_paid
    from public.payment_allocation a
    join public.payment p on p.id = a.payment_id
   where a.comprobante_id = p_comprobante_id
     and p.status <> 'ANULADO';

  select
      coalesce(sum(c2.total) filter (where c2.voucher_type in ('NOTA_CREDITO', 'COMPROBANTE_RETENCION')), 0),
      coalesce(sum(c2.total) filter (where c2.voucher_type = 'NOTA_DEBITO'), 0)
    into v_credit, v_debit
    from public.comprobante c2
   where c2.referenced_comprobante_id = p_comprobante_id
     and c2.deleted_at is null;

  update public.comprobante
     set status = case when v_paid + v_credit >= v_total + v_debit
                       then 'PAGADO'::public.comprobante_status
                       else 'PENDIENTE'::public.comprobante_status end
   where id = p_comprobante_id;
end;
$function$;

-- 6) Recalcular el referenciado cuando nace, cambia o se da de baja una nota.
create or replace function private.refresh_referenced_status()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if tg_op = 'DELETE' then
    if old.referenced_comprobante_id is not null then
      perform private.refresh_comprobante_status(old.referenced_comprobante_id);
    end if;
    return old;
  end if;

  if new.referenced_comprobante_id is not null then
    perform private.refresh_comprobante_status(new.referenced_comprobante_id);
  end if;

  if tg_op = 'UPDATE'
     and old.referenced_comprobante_id is distinct from new.referenced_comprobante_id
     and old.referenced_comprobante_id is not null then
    perform private.refresh_comprobante_status(old.referenced_comprobante_id);
  end if;

  return new;
end;
$function$;

drop trigger if exists comprobante_adjustment_status on public.comprobante;
create trigger comprobante_adjustment_status
  after insert or update or delete on public.comprobante
  for each row
  execute function private.refresh_referenced_status();

-- 7) Con pagos o notas asociadas, importe, numero, cliente y fecha quedan fijos.
create or replace function private.protect_paid_comprobante()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_paid        numeric(12,2);
  v_adjustments integer;
begin
  select coalesce(sum(a.amount), 0) into v_paid
    from public.payment_allocation a
    join public.payment p on p.id = a.payment_id
   where a.comprobante_id = old.id
     and p.status <> 'ANULADO';

  select count(*) into v_adjustments
    from public.comprobante n
   where n.referenced_comprobante_id = old.id
     and n.deleted_at is null;

  if (v_paid > 0 or v_adjustments > 0)
     and (new.total is distinct from old.total
          or new.voucher_number is distinct from old.voucher_number
          or new.entity_id is distinct from old.entity_id
          or new.issue_date is distinct from old.issue_date) then
    raise exception using message = case
      when v_paid > 0 and v_adjustments > 0 then
        'No se puede modificar un comprobante con pagos y notas registradas: anula los pagos antes de cambiar importe, numero, cliente o fecha'
      when v_paid > 0 then
        'No se puede modificar un comprobante con pagos registrados: anula los pagos antes de cambiar importe, numero, cliente o fecha'
      else
        'No se puede modificar un comprobante con notas o retenciones registradas: el importe, numero, cliente y fecha quedan fijos'
    end;
  end if;

  return new;
end;
$function$;

-- 8) El reparto de un pago se topea con el saldo efectivo:
--    total + debitos - creditos del comprobante referenciado.
create or replace function private.validate_allocation()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_total numeric(12,2);
  v_paid numeric(12,2);
  v_credit numeric(12,2);
  v_debit numeric(12,2);
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

  select
      coalesce(sum(c2.total) filter (where c2.voucher_type in ('NOTA_CREDITO', 'COMPROBANTE_RETENCION')), 0),
      coalesce(sum(c2.total) filter (where c2.voucher_type = 'NOTA_DEBITO'), 0)
    into v_credit, v_debit
    from public.comprobante c2
   where c2.referenced_comprobante_id = new.comprobante_id
     and c2.deleted_at is null;

  if v_paid + new.amount > v_total + v_debit - v_credit then
    raise exception 'El importe asignado supera el saldo del comprobante';
  end if;

  return new;
end;
$function$;

-- 9) La vista sigue exponiendo solo comprobantes cobrables/pagables (tipos base),
--    ahora con los montos que ajustan el saldo: creditos (NC + retencion) y
--    debitos (ND). Mismas columnas de antes + credit_amount y debit_amount.
create or replace view public.voucher_balance
with (security_invoker = true)
as
select
  c.id as comprobante_id,
  c.entity_id,
  c.voucher_kind,
  c.voucher_type,
  c.voucher_number,
  c.issue_date,
  c.payment_type,
  case
    when c.payment_type = 'CREDITO'::public.payment_type then c.due_date
    else c.issue_date
  end as effective_due_date,
  c.total,
  coalesce(pay.paid_amount, 0)::numeric(12,2) as paid_amount,
  (c.total - coalesce(pay.paid_amount, 0) - coalesce(adj.credit_amount, 0) + coalesce(adj.debit_amount, 0))::numeric(12,2) as balance,
  c.status,
  coalesce(adj.credit_amount, 0)::numeric(12,2) as credit_amount,
  coalesce(adj.debit_amount, 0)::numeric(12,2) as debit_amount
from public.comprobante c
left join lateral (
  select sum(a.amount) as paid_amount
    from public.payment_allocation a
    join public.payment p on p.id = a.payment_id
   where a.comprobante_id = c.id
     and p.status <> 'ANULADO'
) pay on true
left join lateral (
  select
      sum(n.total) filter (where n.voucher_type in ('NOTA_CREDITO', 'COMPROBANTE_RETENCION')) as credit_amount,
      sum(n.total) filter (where n.voucher_type = 'NOTA_DEBITO') as debit_amount
    from public.comprobante n
   where n.referenced_comprobante_id = c.id
     and n.deleted_at is null
) adj on true
where c.deleted_at is null
  and c.voucher_type in ('FACTURA', 'BOLETA', 'NOTA_VENTA');
