-- SPEC 37, paso 1 de 2: código estable para categorías de caja.
-- Columna nullable + backfill de las semillas + unicidad por dueño.
-- El NOT NULL se aplica en la segunda migración cuando la app siempre envía code.

alter table public.cash_receipt_category add column code text;

update public.cash_receipt_category c
set code = v.code
from (values
  ('INGRESO', 'Cobranza de venta',      'COBRANZA_VENTA'),
  ('INGRESO', 'Anticipo de cliente',    'ANTICIPO_CLIENTE'),
  ('INGRESO', 'Otro ingreso',           'OTRO_INGRESO'),
  ('EGRESO',  'Pago a proveedor',       'PAGO_PROVEEDOR'),
  ('EGRESO',  'Anticipo a proveedor',   'ANTICIPO_PROVEEDOR'),
  ('EGRESO',  'Gasto operativo',        'GASTO_OPERATIVO'),
  ('EGRESO',  'Retiro del propietario', 'RETIRO_PROPIETARIO'),
  ('EGRESO',  'ITF',                    'ITF'),
  ('EGRESO',  'Comisión bancaria',      'COMISION_BANCARIA'),
  ('EGRESO',  'Detracción SPOT',        'DETRACCION_SPOT'),
  ('EGRESO',  'Otro egreso',            'OTRO_EGRESO')
) as v(direction, name, code)
where c.direction::text = v.direction
  and c.name = v.name
  and c.code is null;

do $$
begin
  if exists (select 1 from public.cash_receipt_category where code is null) then
    raise exception 'Backfill incompleto: quedan categorías sin código';
  end if;
end $$;

create unique index cash_receipt_category_owner_id_code_key
  on public.cash_receipt_category (owner_id, code);
