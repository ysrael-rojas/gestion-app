alter table public.payment alter column entity_id drop not null;
comment on column public.payment.entity_id is
  'Entidad del pago. NULL = anticipo sin asignar a cliente/proveedor aún.';

create or replace function private.validate_allocation() returns trigger
language plpgsql security definer set search_path = ''
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
     and p.status = 'REGISTRADO'
     and a.id <> new.id;

  if v_paid + new.amount > v_total then
    raise exception 'El importe asignado supera el saldo del comprobante';
  end if;

  return new;
end;
$$;
