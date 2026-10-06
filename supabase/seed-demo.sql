-- SPEC 21 — Datos demo para el módulo de caja y bancos
--
-- Script idempotente de purga + siembra (purga abajo, siembra en los pasos siguientes).
-- NO es una migración: no crea ni altera esquema. Se ejecuta con el MCP de Supabase
-- (execute_sql) o con cualquier cliente SQL conectado como dueño de las tablas.
--
-- Owner de la demo: yrra_rojas@hotmail.com
--   Los inserts llevan owner_id explícito. RLS no aplica al dueño de la tabla
--   (las políticas no usan FORCE ROW LEVEL SECURITY), así que este SQL inserta
--   sin necesidad de una sesión de auth.
--
-- Los métodos de pago (payment_method) y las categorías (cash_receipt_category)
-- ya sembrados para este owner se CONSERVAN: la siembra los reutiliza por `code`/nombre.

do $$
declare
  v_owner uuid := '7f9e00ea-c5a0-4ddb-b72c-4f6ad912f782';
  -- UUIDs fijos de la demo: permiten referenciar las filas entre los pasos de
  -- la siembra sin depender del orden de inserción ni de consultas intermedias.
  v_caja  uuid := '11111111-1111-4111-8111-111111111111';
  v_banco uuid := '22222222-2222-4222-8222-222222222222';
  -- Clientes de la demo (Paso 3)
  v_cli1 uuid := '00000001-0000-4000-8000-000000000001';
  v_cli2 uuid := '00000002-0000-4000-8000-000000000002';
  v_cli3 uuid := '00000003-0000-4000-8000-000000000003';
  v_cli4 uuid := '00000004-0000-4000-8000-000000000004';
  v_cli5 uuid := '00000005-0000-4000-8000-000000000005';
  v_cli6 uuid := '00000006-0000-4000-8000-000000000006';
  -- IDs de métodos y categorías: se resuelven por `code`/nombre más abajo,
  -- porque ya fueron sembrados para este owner y no queremos hardcodearlos.
  v_met_efectivo uuid;
  v_met_transfer uuid;
  v_met_tarjeta  uuid;
  v_cat_cobranza uuid;
begin
  -- Purga en orden de dependencias:
  --   payment_allocation -> payment -> cash_close -> comprobante -> entidad -> cash_account
  delete from public.payment_allocation where owner_id = v_owner;
  delete from public.payment          where owner_id = v_owner;
  delete from public.cash_close       where owner_id = v_owner;
  delete from public.comprobante      where owner_id = v_owner;
  delete from public.entidad          where owner_id = v_owner;
  delete from public.cash_account     where owner_id = v_owner;

  -- receipt_sequence es global (no tiene owner_id): se reinicia para que los
  -- correlativos de recibo (RI-/RE-) arranquen limpios. Mismo enfoque que SPEC 19.
  truncate table public.receipt_sequence;

  -- ============================ Siembra ============================
  -- Fechas: todo se reparte en los últimos ~90 días para poder probar
  -- cuadres con períodos pasados. `opening_balance_date` queda antes del
  -- primer movimiento para que las cuentas estén abiertas desde el inicio.

  -- Paso 2 — Cuentas de caja y banco -----------------------------------
  insert into public.cash_account (
    id, owner_id, type, name, currency,
    bank_name, account_number, cci,
    opening_balance, opening_balance_date, closing_periodicity, notes, is_active
  ) values
    (
      v_caja, v_owner, 'CASH_BOX', 'Caja General', 'PEN',
      null, null, null,
      0, current_date - 90, 'DAILY', 'Caja de efectivo de la demo', true
    ),
    (
      v_banco, v_owner, 'BANK_ACCOUNT', 'Banco BCP', 'PEN',
      'BCP', '193-1234567-0-12', '0021931234567012',
      0, current_date - 90, 'MONTHLY', 'Cuenta corriente de la demo', true
    );

  -- Paso 3 — Clientes --------------------------------------------------
  insert into public.entidad (
    id, owner_id, document_type, document_number, name, address, phone,
    contact_name, billing_email, management_email, is_client, is_supplier
  ) values
    (v_cli1, v_owner, 'RUC', '20480123456', 'DISTRIBUIDORA SAN MARTIN SAC',  'Av. Larco 123, Trujillo',        '044-201234', 'Ana Torres',    'compras@sanmartin.pe',    '', true, false),
    (v_cli2, v_owner, 'RUC', '20481234567', 'FERRETERIA EL SOL EIRL',        'Jr. Pizarro 456, Trujillo',      '044-202345', 'Luis Quispe',   'ventas@ferreteriaelsol.pe','', true, false),
    (v_cli3, v_owner, 'RUC', '20482345678', 'INVERSIONES LAMBAYEQUE SAC',    'Av. Balta 789, Chiclayo',        '074-203456', 'Rosa Fernandez', 'pagos@invlambayeque.pe',  '', true, false),
    (v_cli4, v_owner, 'RUC', '20483456789', 'TEXTILES DEL NORTE SRL',        'Calle Colon 321, Trujillo',      '044-204567', 'Carlos Mendez', 'tesoreria@textilesnorte.pe','', true, false),
    (v_cli5, v_owner, 'RUC', '20484567890', 'BODEGA LA ESPERANZA EIRL',      'Av. America 654, Trujillo',      '044-205678', 'Maria Chavez',  'admin@bodegaesperanza.pe', '', true, false),
    (v_cli6, v_owner, 'RUC', '20485678901', 'CONSTRUCTORA MOCHE SAC',        'Av. Mansiche 987, Trujillo',     '044-206789', 'Jorge Rios',    'compras@constructmoche.pe','', true, false);

  -- Paso 4 — Facturas de venta (14) ------------------------------------
  -- `subtotal` e `igv` se derivan del total con IGV 18%: subtotal = total / 1.18.
  -- `due_date` es columna generada (issue_date + credit_days para crédito): no se escribe.
  -- Las fechas son relativas a hoy (últimos ~75 días) para que la demo siga
  -- siendo reciente al re-ejecutarla.
  -- Reparto de estados (los pagos se siembran en el Paso 5):
  --   PAGADO   -> FF01-00001..00003
  --   parcial  -> FF01-00004..00007
  --   sin pago -> FF01-00008..00014
  insert into public.comprobante (
    id, owner_id, entity_id, voucher_kind, voucher_type, voucher_number,
    issue_date, registration_date, subtotal, igv, total,
    payment_type, credit_days, status
  )
  select
    v.id, v_owner, v.entity_id, 'VENTA', 'FACTURA', v.voucher_number,
    current_date - v.days_ago, current_date - v.days_ago,
    round(v.total / 1.18, 2),
    v.total - round(v.total / 1.18, 2),
    v.total,
    v.payment_type,
    v.credit_days,
    'PENDIENTE'
  from (values
    ('c0000001-0000-4000-8000-000000000001'::uuid, v_cli1, 'FF01-00001', 74, 2500.00::numeric, 'CONTADO'::public.payment_type, null::integer),
    ('c0000002-0000-4000-8000-000000000002'::uuid, v_cli2, 'FF01-00002', 70, 1180.00::numeric, 'CONTADO'::public.payment_type, null::integer),
    ('c0000003-0000-4000-8000-000000000003'::uuid, v_cli3, 'FF01-00003', 64, 3540.00::numeric, 'CREDITO'::public.payment_type, 30),
    ('c0000004-0000-4000-8000-000000000004'::uuid, v_cli4, 'FF01-00004', 57,  826.00::numeric, 'CONTADO'::public.payment_type, null::integer),
    ('c0000005-0000-4000-8000-000000000005'::uuid, v_cli5, 'FF01-00005', 49, 4720.00::numeric, 'CREDITO'::public.payment_type, 15),
    ('c0000006-0000-4000-8000-000000000006'::uuid, v_cli6, 'FF01-00006', 42, 1770.00::numeric, 'CREDITO'::public.payment_type, 30),
    ('c0000007-0000-4000-8000-000000000007'::uuid, v_cli1, 'FF01-00007', 34, 5900.00::numeric, 'CREDITO'::public.payment_type, 30),
    ('c0000008-0000-4000-8000-000000000008'::uuid, v_cli2, 'FF01-00008', 27,  944.00::numeric, 'CONTADO'::public.payment_type, null::integer),
    ('c0000009-0000-4000-8000-000000000009'::uuid, v_cli3, 'FF01-00009', 21, 2360.00::numeric, 'CONTADO'::public.payment_type, null::integer),
    ('c0000010-0000-4000-8000-000000000010'::uuid, v_cli4, 'FF01-00010', 15, 4130.00::numeric, 'CREDITO'::public.payment_type, 30),
    ('c0000011-0000-4000-8000-000000000011'::uuid, v_cli5, 'FF01-00011',  8, 1475.00::numeric, 'CONTADO'::public.payment_type, null::integer),
    ('c0000012-0000-4000-8000-000000000012'::uuid, v_cli6, 'FF01-00012',  5, 2950.00::numeric, 'CONTADO'::public.payment_type, null::integer),
    ('c0000013-0000-4000-8000-000000000013'::uuid, v_cli1, 'FF01-00013',  4, 3540.00::numeric, 'CREDITO'::public.payment_type, 15),
    ('c0000014-0000-4000-8000-000000000014'::uuid, v_cli2, 'FF01-00014',  1, 1062.00::numeric, 'CONTADO'::public.payment_type, null::integer)
  ) as v(id, entity_id, voucher_number, days_ago, total, payment_type, credit_days);

  -- Paso 5 — Recibos de ingreso (10) -----------------------------------
  -- Métodos y categoría existentes, resueltos por `code`/nombre.
  select id into strict v_met_efectivo from public.payment_method       where owner_id = v_owner and code = 'EFECTIVO';
  select id into strict v_met_transfer from public.payment_method       where owner_id = v_owner and code = 'TRANSFERENCIA_BCP';
  select id into strict v_met_tarjeta  from public.payment_method       where owner_id = v_owner and code = 'TARJETA_CREDITO';
  select id into strict v_cat_cobranza from public.cash_receipt_category where owner_id = v_owner and name = 'Cobranza de venta' and direction = 'INGRESO';

  -- `receipt_serial` y `receipt_number` (RI-NNNNNN) los asigna/genera la DB.
  -- Los recibos se reparten en Caja General (efectivo) y Banco BCP (transferencia/tarjeta).
  insert into public.payment (
    id, owner_id, entity_id, direction, payment_date, amount,
    method_id, cash_account_id, category_id, reference, notes
  ) values
    ('d0000001-0000-4000-8000-000000000001', v_owner, v_cli1, 'INGRESO', current_date - 72, 2500.00, v_met_efectivo, v_caja,  v_cat_cobranza, 'REC-0001', null),
    ('d0000002-0000-4000-8000-000000000002', v_owner, v_cli2, 'INGRESO', current_date - 69, 1180.00, v_met_transfer, v_banco, v_cat_cobranza, 'TRF-BCP-0002', null),
    ('d0000003-0000-4000-8000-000000000003', v_owner, v_cli3, 'INGRESO', current_date - 50, 3540.00, v_met_transfer, v_banco, v_cat_cobranza, 'TRF-BCP-0003', null),
    ('d0000004-0000-4000-8000-000000000004', v_owner, v_cli4, 'INGRESO', current_date - 45,  300.00, v_met_efectivo, v_caja,  v_cat_cobranza, 'REC-0004', 'Abono parcial FF01-00004'),
    ('d0000005-0000-4000-8000-000000000005', v_owner, v_cli5, 'INGRESO', current_date - 40, 1500.00, v_met_transfer, v_banco, v_cat_cobranza, 'TRF-BCP-0005', 'Abono parcial FF01-00005'),
    ('d0000006-0000-4000-8000-000000000006', v_owner, v_cli6, 'INGRESO', current_date - 30,  500.00, v_met_efectivo, v_caja,  v_cat_cobranza, 'REC-0006', 'Abono parcial FF01-00006'),
    ('d0000007-0000-4000-8000-000000000007', v_owner, v_cli1, 'INGRESO', current_date - 25, 2000.00, v_met_transfer, v_banco, v_cat_cobranza, 'TRF-BCP-0007', 'Abono parcial FF01-00007'),
    ('d0000008-0000-4000-8000-000000000008', v_owner, v_cli5, 'INGRESO', current_date - 20, 1000.00, v_met_tarjeta,  v_banco, v_cat_cobranza, 'POS-0008', 'Segundo abono FF01-00005'),
    ('d0000009-0000-4000-8000-000000000009', v_owner, v_cli1, 'INGRESO', current_date - 12, 1500.00, v_met_efectivo, v_caja,  v_cat_cobranza, 'REC-0009', 'Segundo abono FF01-00007'),
    ('d0000010-0000-4000-8000-000000000010', v_owner, v_cli6, 'INGRESO', current_date -  6,  200.00, v_met_efectivo, v_caja,  v_cat_cobranza, 'REC-0010', 'Segundo abono FF01-00006');

  -- Asignación de cada recibo a su factura. Los triggers recalculan el estado
  -- del comprobante: PAGADO si el saldo llega a 0, PENDIENTE si queda saldo.
  insert into public.payment_allocation (owner_id, payment_id, comprobante_id, amount) values
    (v_owner, 'd0000001-0000-4000-8000-000000000001', 'c0000001-0000-4000-8000-000000000001', 2500.00),
    (v_owner, 'd0000002-0000-4000-8000-000000000002', 'c0000002-0000-4000-8000-000000000002', 1180.00),
    (v_owner, 'd0000003-0000-4000-8000-000000000003', 'c0000003-0000-4000-8000-000000000003', 3540.00),
    (v_owner, 'd0000004-0000-4000-8000-000000000004', 'c0000004-0000-4000-8000-000000000004',  300.00),
    (v_owner, 'd0000005-0000-4000-8000-000000000005', 'c0000005-0000-4000-8000-000000000005', 1500.00),
    (v_owner, 'd0000006-0000-4000-8000-000000000006', 'c0000006-0000-4000-8000-000000000006',  500.00),
    (v_owner, 'd0000007-0000-4000-8000-000000000007', 'c0000007-0000-4000-8000-000000000007', 2000.00),
    (v_owner, 'd0000008-0000-4000-8000-000000000008', 'c0000005-0000-4000-8000-000000000005', 1000.00),
    (v_owner, 'd0000009-0000-4000-8000-000000000009', 'c0000007-0000-4000-8000-000000000007', 1500.00),
    (v_owner, 'd0000010-0000-4000-8000-000000000010', 'c0000006-0000-4000-8000-000000000006',  200.00);
end $$;
