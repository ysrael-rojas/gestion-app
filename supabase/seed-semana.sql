-- Seed semanal 21-27 oct 2026 — purga + siembra de una semana operativa
--
-- Reemplaza el escenario de 90 dias de `seed-demo.sql` para pruebas de caja,
-- cobranzas, cartera y conciliacion. NO es una migracion: no crea ni altera
-- esquema. Se ejecuta por bloques con el MCP de Supabase (execute_sql) o con
-- cualquier cliente SQL conectado como dueno de las tablas.
--
-- Owner de la demo: yrra_rojas@hotmail.com (7f9e00ea-c5a0-4ddb-b72c-4f6ad912f782)
--
-- Escenario:
--   * 7 dias cerrados: mie 21 -> mar 27 oct 2026.
--   * Hoy (28 oct) queda sin movimientos ni cierre para probar en vivo.
--   * Caja General: cierre diario. Banco BCP: un cierre semanal (mensual).
--   * 28 ventas + 1 nota de credito, 12 compras, 45 recibos.
--   * Casos borde: recibo anulado, anticipo sin asignar, 2 transferencias,
--     1 arqueo sorpresa, 2 cierres por denominaciones, 1 diferencia dentro de
--     tolerancia y 1 diferencia con motivo.
--
-- IMPORTANTE: `close_cash_account`, `create_payment_with_allocations`,
-- `create_cash_transfer`, `register_cash_count` y `mark_payments_processed`
-- exigen `auth.uid() = owner_id`. Cada bloque impersona al dueno con
-- `set_config('request.jwt.claims', ...)` para usar las funciones reales.
--
-- Orden obligatorio: los pagos de un dia se registran ANTES del cierre de ese
-- dia, porque `private.assert_account_open_for` bloquea movimientos con fecha
-- anterior o igual al ultimo cierre de la cuenta.

-- =====================================================================
-- BLOQUE 0 — Purga transaccional (conserva entidades, cuentas y catalogos)
-- =====================================================================
do $$
declare
  v_owner uuid := '7f9e00ea-c5a0-4ddb-b72c-4f6ad912f782';
begin
  delete from public.bank_reconciliation_item
   where reconciliation_id in (
     select id from public.bank_reconciliation where owner_id = v_owner
   );
  delete from public.bank_reconciliation where owner_id = v_owner;

  -- petty_cash_vale referencia payment: va antes.
  delete from public.petty_cash_vale where owner_id = v_owner;
  delete from public.payment_allocation where owner_id = v_owner;
  delete from public.payment where owner_id = v_owner;

  delete from public.cash_close_denomination
   where cash_close_id in (
     select id from public.cash_close where owner_id = v_owner
   );
  delete from public.cash_close where owner_id = v_owner;

  delete from public.cash_count_denomination
   where cash_count_id in (
     select id from public.cash_count where owner_id = v_owner
   );
  delete from public.cash_count where owner_id = v_owner;

  delete from public.cash_transfer where owner_id = v_owner;
  delete from public.comprobante where owner_id = v_owner;

  -- Correlativos de recibo (global) y de series de comprobante.
  truncate table public.receipt_sequence;
  update public.voucher_series set last_number = 0 where owner_id = v_owner;
end $$;

-- =====================================================================
-- BLOQUE 1 — Saldos iniciales y proveedores
-- =====================================================================
do $$
declare
  v_owner uuid := '7f9e00ea-c5a0-4ddb-b72c-4f6ad912f782';
begin
  -- La semana arranca con dinero real en cada cuenta.
  update public.cash_account
     set opening_balance = 800.00,
         opening_balance_date = date '2026-10-20'
   where owner_id = v_owner and name = 'Caja General';

  update public.cash_account
     set opening_balance = 12500.00,
         opening_balance_date = date '2026-10-20',
         closing_periodicity = 'MONTHLY'
   where owner_id = v_owner and name = 'Banco BCP';

  -- Proveedores de la demo (UUIDs fijos para que el seed sea repetible).
  insert into public.entidad (
    id, owner_id, document_type, document_number, name, address, phone,
    contact_name, billing_email, management_email, is_client, is_supplier
  ) values
    ('00000007-0000-4000-8000-000000000007', v_owner, 'RUC', '20501122334',
     'AGROINDUSTRIAL TRUJILLO SAC', 'Av. Industrial 210, Trujillo',
     '044-301210', 'Pedro Alcántara', 'compras@agroindustrial.pe', '', false, true),
    ('00000008-0000-4000-8000-000000000008', v_owner, 'RUC', '20502233445',
     'IMPORTADORA PACIFICO EIRL', 'Jr. Union 455, Trujillo',
     '044-302220', 'Lucía Nakamura', 'ventas@importapacifico.pe', '', false, true),
    ('00000009-0000-4000-8000-000000000009', v_owner, 'RUC', '20503344556',
     'SERVICIOS LOGISTICOS CHIMU SAC', 'Panamericana Norte km 558, Trujillo',
     '044-303330', 'Marco Valderrama', 'cuentas@logchimu.pe', '', false, true)
  on conflict (id) do update
    set name = excluded.name,
        document_number = excluded.document_number,
        is_supplier = true,
        deleted_at = null;
end $$;

-- =====================================================================
-- BLOQUE 2 — Comprobantes de la semana (ventas + nota de credito + compras)
-- =====================================================================
do $$
declare
  v_owner uuid := '7f9e00ea-c5a0-4ddb-b72c-4f6ad912f782';
  v_cli1 uuid := '00000001-0000-4000-8000-000000000001';
  v_cli2 uuid := '00000002-0000-4000-8000-000000000002';
  v_cli3 uuid := '00000003-0000-4000-8000-000000000003';
  v_cli4 uuid := '00000004-0000-4000-8000-000000000004';
  v_cli5 uuid := '00000005-0000-4000-8000-000000000005';
  v_cli6 uuid := '00000006-0000-4000-8000-000000000006';
  v_sup1 uuid := '00000007-0000-4000-8000-000000000007';
  v_sup2 uuid := '00000008-0000-4000-8000-000000000008';
  v_sup3 uuid := '00000009-0000-4000-8000-000000000009';
begin
  -- Ventas. subtotal/igv derivados del total con IGV 18%; due_date es generada.
  insert into public.comprobante (
    id, owner_id, entity_id, voucher_kind, voucher_type, voucher_number,
    issue_date, registration_date, subtotal, igv, total,
    payment_type, credit_days, status
  )
  select
    v.id, v_owner, v.entity_id, 'VENTA', v.voucher_type, v.voucher_number,
    v.issue_date, v.issue_date,
    round(v.total / 1.18, 2),
    v.total - round(v.total / 1.18, 2),
    v.total, v.payment_type, v.credit_days, 'PENDIENTE'
  from (values
    ('a0000001-0000-4000-8000-000000000001'::uuid, v_cli1, 'FACTURA'::public.voucher_type,    'FV01-000001', date '2026-10-21', 2360.00::numeric, 'CONTADO'::public.payment_type, null::integer),
    ('a0000002-0000-4000-8000-000000000002'::uuid, v_cli2, 'FACTURA',    'FV01-000002', date '2026-10-21', 1180.00, 'CONTADO', null),
    ('a0000003-0000-4000-8000-000000000003'::uuid, v_cli3, 'FACTURA',    'FV01-000003', date '2026-10-21', 4720.00, 'CREDITO', 30),
    ('a0000004-0000-4000-8000-000000000004'::uuid, v_cli4, 'BOLETA',     'BV01-000001', date '2026-10-21',  590.00, 'CONTADO', null),
    ('a0000005-0000-4000-8000-000000000005'::uuid, v_cli5, 'FACTURA',    'FV01-000004', date '2026-10-22', 3540.00, 'CREDITO', 15),
    ('a0000006-0000-4000-8000-000000000006'::uuid, v_cli6, 'FACTURA',    'FV01-000005', date '2026-10-22', 1770.00, 'CONTADO', null),
    ('a0000007-0000-4000-8000-000000000007'::uuid, v_cli1, 'FACTURA',    'FV01-000006', date '2026-10-22', 2950.00, 'CONTADO', null),
    ('a0000008-0000-4000-8000-000000000008'::uuid, v_cli2, 'BOLETA',     'BV01-000002', date '2026-10-22',  413.00, 'CONTADO', null),
    ('a0000009-0000-4000-8000-000000000009'::uuid, v_cli3, 'NOTA_VENTA', 'NV01-000001', date '2026-10-22',  826.00, 'CONTADO', null),
    ('a0000010-0000-4000-8000-000000000010'::uuid, v_cli4, 'FACTURA',    'FV01-000007', date '2026-10-23', 5310.00, 'CREDITO', 30),
    ('a0000011-0000-4000-8000-000000000011'::uuid, v_cli5, 'FACTURA',    'FV01-000008', date '2026-10-23',  944.00, 'CONTADO', null),
    ('a0000012-0000-4000-8000-000000000012'::uuid, v_cli6, 'BOLETA',     'BV01-000003', date '2026-10-23',  354.00, 'CONTADO', null),
    ('a0000013-0000-4000-8000-000000000013'::uuid, v_cli1, 'NOTA_VENTA', 'NV01-000002', date '2026-10-23',  649.00, 'CONTADO', null),
    ('a0000014-0000-4000-8000-000000000014'::uuid, v_cli2, 'FACTURA',    'FV01-000009', date '2026-10-24', 2360.00, 'CONTADO', null),
    ('a0000015-0000-4000-8000-000000000015'::uuid, v_cli3, 'FACTURA',    'FV01-000010', date '2026-10-24', 8260.00, 'CREDITO', 30),
    ('a0000016-0000-4000-8000-000000000016'::uuid, v_cli4, 'BOLETA',     'BV01-000004', date '2026-10-24',  472.00, 'CONTADO', null),
    ('a0000017-0000-4000-8000-000000000017'::uuid, v_cli5, 'FACTURA',    'FV01-000011', date '2026-10-25', 1475.00, 'CONTADO', null),
    ('a0000018-0000-4000-8000-000000000018'::uuid, v_cli6, 'BOLETA',     'BV01-000005', date '2026-10-25',  295.00, 'CONTADO', null),
    ('a0000019-0000-4000-8000-000000000019'::uuid, v_cli1, 'FACTURA',    'FV01-000012', date '2026-10-26', 6490.00, 'CREDITO', 30),
    ('a0000020-0000-4000-8000-000000000020'::uuid, v_cli2, 'FACTURA',    'FV01-000013', date '2026-10-26', 1770.00, 'CONTADO', null),
    ('a0000021-0000-4000-8000-000000000021'::uuid, v_cli3, 'FACTURA',    'FV01-000014', date '2026-10-26', 2360.00, 'CONTADO', null),
    ('a0000022-0000-4000-8000-000000000022'::uuid, v_cli4, 'BOLETA',     'BV01-000006', date '2026-10-26',  708.00, 'CONTADO', null),
    ('a0000023-0000-4000-8000-000000000023'::uuid, v_cli5, 'NOTA_VENTA', 'NV01-000003', date '2026-10-26', 1180.00, 'CONTADO', null),
    ('a0000024-0000-4000-8000-000000000024'::uuid, v_cli6, 'FACTURA',    'FV01-000015', date '2026-10-27', 3540.00, 'CREDITO', 15),
    ('a0000025-0000-4000-8000-000000000025'::uuid, v_cli1, 'FACTURA',    'FV01-000016', date '2026-10-27', 2360.00, 'CONTADO', null),
    ('a0000026-0000-4000-8000-000000000026'::uuid, v_cli2, 'FACTURA',    'FV01-000017', date '2026-10-27', 1180.00, 'CONTADO', null),
    ('a0000027-0000-4000-8000-000000000027'::uuid, v_cli3, 'BOLETA',     'BV01-000007', date '2026-10-27',  413.00, 'CONTADO', null),
    ('a0000028-0000-4000-8000-000000000028'::uuid, v_cli4, 'NOTA_VENTA', 'NV01-000004', date '2026-10-27',  590.00, 'CONTADO', null)
  ) as v(id, entity_id, voucher_type, voucher_number, issue_date, total, payment_type, credit_days);

  -- Nota de credito que reduce el saldo de FV01-000004 (3540 - 1000 - 120).
  insert into public.comprobante (
    id, owner_id, entity_id, voucher_kind, voucher_type, voucher_number,
    issue_date, registration_date, subtotal, igv, total,
    payment_type, credit_days, status, referenced_comprobante_id, motive_code
  ) values (
    'a0000029-0000-4000-8000-000000000029', v_owner, v_cli5, 'VENTA',
    'NOTA_CREDITO', 'NC01-000001', date '2026-10-24', date '2026-10-24',
    round(120.00 / 1.18, 2), 120.00 - round(120.00 / 1.18, 2), 120.00,
    'CONTADO', null, 'PENDIENTE',
    'a0000005-0000-4000-8000-000000000005', '07'
  );

  -- Compras: numeracion manual con el numero del proveedor (sin series).
  insert into public.comprobante (
    id, owner_id, entity_id, voucher_kind, voucher_type, voucher_number,
    issue_date, registration_date, subtotal, igv, total,
    payment_type, credit_days, status
  )
  select
    v.id, v_owner, v.entity_id, 'COMPRA', 'FACTURA', v.voucher_number,
    v.issue_date, v.issue_date,
    round(v.total / 1.18, 2),
    v.total - round(v.total / 1.18, 2),
    v.total, v.payment_type, v.credit_days, 'PENDIENTE'
  from (values
    ('b0000001-0000-4000-8000-000000000001'::uuid, v_sup1, 'F001-00121', date '2026-10-21', 2950.00::numeric, 'CREDITO'::public.payment_type, 15),
    ('b0000002-0000-4000-8000-000000000002'::uuid, v_sup2, 'F001-00122', date '2026-10-21', 1180.00, 'CONTADO', null),
    ('b0000003-0000-4000-8000-000000000003'::uuid, v_sup3, 'F002-00045', date '2026-10-22', 1770.00, 'CONTADO', null),
    ('b0000004-0000-4000-8000-000000000004'::uuid, v_sup1, 'F001-00123', date '2026-10-22', 4130.00, 'CREDITO', 30),
    ('b0000005-0000-4000-8000-000000000005'::uuid, v_sup2, 'F002-00046', date '2026-10-23', 2360.00, 'CONTADO', null),
    ('b0000006-0000-4000-8000-000000000006'::uuid, v_sup3, 'F003-00012', date '2026-10-23',  944.00, 'CONTADO', null),
    ('b0000007-0000-4000-8000-000000000007'::uuid, v_sup1, 'F001-00124', date '2026-10-24', 1475.00, 'CONTADO', null),
    ('b0000008-0000-4000-8000-000000000008'::uuid, v_sup2, 'F002-00047', date '2026-10-25',  826.00, 'CONTADO', null),
    ('b0000009-0000-4000-8000-000000000009'::uuid, v_sup1, 'F001-00125', date '2026-10-26', 3540.00, 'CREDITO', 15),
    ('b0000010-0000-4000-8000-000000000010'::uuid, v_sup3, 'F003-00013', date '2026-10-26', 1180.00, 'CONTADO', null),
    ('b0000011-0000-4000-8000-000000000011'::uuid, v_sup2, 'F002-00048', date '2026-10-27', 2360.00, 'CREDITO', 30),
    ('b0000012-0000-4000-8000-000000000012'::uuid, v_sup3, 'F003-00014', date '2026-10-27',  590.00, 'CONTADO', null)
  ) as v(id, entity_id, voucher_number, issue_date, total, payment_type, credit_days);

  -- Sincroniza el ultimo correlativo de cada serie con lo sembrado.
  update public.voucher_series s
     set last_number = coalesce((
       select max((regexp_match(c.voucher_number, '-([0-9]+)$'))[1]::integer)
         from public.comprobante c
        where c.owner_id = v_owner
          and c.voucher_kind = 'VENTA'
          and c.voucher_number like s.code || '-%'
     ), 0)
   where s.owner_id = v_owner;
end $$;

-- =====================================================================
-- BLOQUE 3 — Dia 21 (mie): cobros, egresos y cierre de Caja General
-- =====================================================================
do $$
declare
  v_owner     uuid := '7f9e00ea-c5a0-4ddb-b72c-4f6ad912f782';
  v_caja      uuid := '11111111-1111-4111-8111-111111111111';
  v_banco     uuid := '22222222-2222-4222-8222-222222222222';
  v_efectivo  uuid := '37178d46-97b1-4ef9-8f1e-77bef296873c';
  v_transfer  uuid := 'fc385e8d-a036-4199-98f5-8b4cc36ff29c';
  v_cobranza  uuid := '6055077c-fe23-4f10-ab98-3476c410178d';
  v_pago_prov uuid := '7b1886f4-a9ed-44a8-851a-e781e956f0f1';
  v_gasto     uuid := 'c6eac462-51ea-4f71-a904-82fbaf120bf9';
  v_p1 uuid; v_p2 uuid; v_p3 uuid; v_p4 uuid; v_p5 uuid; v_p6 uuid;
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_owner)::text, true);

  v_p1 := public.create_payment_with_allocations(
    '00000001-0000-4000-8000-000000000001', 'INGRESO', date '2026-10-21', 2360.00,
    v_efectivo, v_caja, v_cobranza, 'DEP-2101', null,
    '[{"comprobante_id":"a0000001-0000-4000-8000-000000000001","amount":2360.00}]'::jsonb);

  v_p2 := public.create_payment_with_allocations(
    '00000002-0000-4000-8000-000000000002', 'INGRESO', date '2026-10-21', 1180.00,
    v_transfer, v_banco, v_cobranza, 'TRF-2102', null,
    '[{"comprobante_id":"a0000002-0000-4000-8000-000000000002","amount":1180.00}]'::jsonb);

  v_p3 := public.create_payment_with_allocations(
    '00000004-0000-4000-8000-000000000004', 'INGRESO', date '2026-10-21', 590.00,
    v_efectivo, v_caja, v_cobranza, 'DEP-2103', null,
    '[{"comprobante_id":"a0000004-0000-4000-8000-000000000004","amount":590.00}]'::jsonb);

  v_p4 := public.create_payment_with_allocations(
    '00000003-0000-4000-8000-000000000003', 'INGRESO', date '2026-10-21', 2000.00,
    v_transfer, v_banco, v_cobranza, 'TRF-2104', 'Abono parcial FF01-000003',
    '[{"comprobante_id":"a0000003-0000-4000-8000-000000000003","amount":2000.00}]'::jsonb);

  v_p5 := public.create_payment_with_allocations(
    '00000008-0000-4000-8000-000000000008', 'EGRESO', date '2026-10-21', 1180.00,
    v_transfer, v_banco, v_pago_prov, 'TRF-2105', null,
    '[{"comprobante_id":"b0000002-0000-4000-8000-000000000002","amount":1180.00}]'::jsonb);

  v_p6 := public.create_payment_with_allocations(
    null, 'EGRESO', date '2026-10-21', 120.00,
    v_efectivo, v_caja, v_gasto, 'MOV-2106', 'Movilidad y fotocopias',
    '[]'::jsonb);

  perform public.mark_payments_processed(array[v_p1, v_p2, v_p3, v_p4, v_p5, v_p6]);

  perform public.close_cash_account(
    v_caja, date '2026-10-21', 3630.00, 'Cierre del dia con conteo de billetes',
    '[{"denomination":200,"quantity":15},{"denomination":100,"quantity":5},
      {"denomination":50,"quantity":2},{"denomination":20,"quantity":1},
      {"denomination":10,"quantity":1}]'::jsonb,
    null, 'Yrra Rojas', 'Yrra Rojas');
end $$;

-- =====================================================================
-- BLOQUE 4 — Dia 22 (jue): diferencia dentro de tolerancia
-- =====================================================================
do $$
declare
  v_owner     uuid := '7f9e00ea-c5a0-4ddb-b72c-4f6ad912f782';
  v_caja      uuid := '11111111-1111-4111-8111-111111111111';
  v_banco     uuid := '22222222-2222-4222-8222-222222222222';
  v_efectivo  uuid := '37178d46-97b1-4ef9-8f1e-77bef296873c';
  v_transfer  uuid := 'fc385e8d-a036-4199-98f5-8b4cc36ff29c';
  v_cobranza  uuid := '6055077c-fe23-4f10-ab98-3476c410178d';
  v_pago_prov uuid := '7b1886f4-a9ed-44a8-851a-e781e956f0f1';
  v_gasto     uuid := 'c6eac462-51ea-4f71-a904-82fbaf120bf9';
  v_comision  uuid := '90fc9171-4a3a-40a7-bb9e-069c121034c4';
  v_p1 uuid; v_p2 uuid; v_p3 uuid; v_p4 uuid; v_p5 uuid; v_p6 uuid; v_p7 uuid;
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_owner)::text, true);

  v_p1 := public.create_payment_with_allocations(
    '00000006-0000-4000-8000-000000000006', 'INGRESO', date '2026-10-22', 1770.00,
    v_transfer, v_banco, v_cobranza, 'TRF-2201', null,
    '[{"comprobante_id":"a0000006-0000-4000-8000-000000000006","amount":1770.00}]'::jsonb);

  v_p2 := public.create_payment_with_allocations(
    '00000001-0000-4000-8000-000000000001', 'INGRESO', date '2026-10-22', 2950.00,
    v_efectivo, v_caja, v_cobranza, 'DEP-2202', null,
    '[{"comprobante_id":"a0000007-0000-4000-8000-000000000007","amount":2950.00}]'::jsonb);

  v_p3 := public.create_payment_with_allocations(
    '00000002-0000-4000-8000-000000000002', 'INGRESO', date '2026-10-22', 413.00,
    v_efectivo, v_caja, v_cobranza, 'DEP-2203', null,
    '[{"comprobante_id":"a0000008-0000-4000-8000-000000000008","amount":413.00}]'::jsonb);

  v_p4 := public.create_payment_with_allocations(
    '00000005-0000-4000-8000-000000000005', 'INGRESO', date '2026-10-22', 1000.00,
    v_transfer, v_banco, v_cobranza, 'TRF-2204', 'Abono parcial FF01-000004',
    '[{"comprobante_id":"a0000005-0000-4000-8000-000000000005","amount":1000.00}]'::jsonb);

  v_p5 := public.create_payment_with_allocations(
    '00000009-0000-4000-8000-000000000009', 'EGRESO', date '2026-10-22', 1770.00,
    v_transfer, v_banco, v_pago_prov, 'TRF-2205', null,
    '[{"comprobante_id":"b0000003-0000-4000-8000-000000000003","amount":1770.00}]'::jsonb);

  v_p6 := public.create_payment_with_allocations(
    null, 'EGRESO', date '2026-10-22', 45.00,
    v_efectivo, v_caja, v_gasto, 'MOV-2206', 'Taxi a banco',
    '[]'::jsonb);

  v_p7 := public.create_payment_with_allocations(
    null, 'EGRESO', date '2026-10-22', 15.00,
    v_transfer, v_banco, v_comision, 'COM-2207', 'Comision por transferencia',
    '[]'::jsonb);

  perform public.mark_payments_processed(array[v_p1, v_p2, v_p3, v_p4, v_p5, v_p6, v_p7]);

  -- Faltante de 0.20: dentro de la tolerancia (0.50), no exige motivo.
  perform public.close_cash_account(
    v_caja, date '2026-10-22', 6947.80, 'Faltante minimo de vuelto',
    null, null, 'Yrra Rojas', 'Yrra Rojas');
end $$;

-- =====================================================================
-- BLOQUE 5 — Dia 23 (vie): recibo anulado y transferencia banco -> caja
-- =====================================================================
do $$
declare
  v_owner     uuid := '7f9e00ea-c5a0-4ddb-b72c-4f6ad912f782';
  v_caja      uuid := '11111111-1111-4111-8111-111111111111';
  v_banco     uuid := '22222222-2222-4222-8222-222222222222';
  v_efectivo  uuid := '37178d46-97b1-4ef9-8f1e-77bef296873c';
  v_transfer  uuid := 'fc385e8d-a036-4199-98f5-8b4cc36ff29c';
  v_cobranza  uuid := '6055077c-fe23-4f10-ab98-3476c410178d';
  v_pago_prov uuid := '7b1886f4-a9ed-44a8-851a-e781e956f0f1';
  v_gasto     uuid := 'c6eac462-51ea-4f71-a904-82fbaf120bf9';
  v_p1 uuid; v_p2 uuid; v_p3 uuid; v_p4 uuid; v_p5 uuid; v_p6 uuid; v_p7 uuid; v_p8 uuid;
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_owner)::text, true);

  v_p1 := public.create_payment_with_allocations(
    '00000004-0000-4000-8000-000000000004', 'INGRESO', date '2026-10-23', 3000.00,
    v_transfer, v_banco, v_cobranza, 'TRF-2301', 'Abono parcial FF01-000007',
    '[{"comprobante_id":"a0000010-0000-4000-8000-000000000010","amount":3000.00}]'::jsonb);

  v_p2 := public.create_payment_with_allocations(
    '00000005-0000-4000-8000-000000000005', 'INGRESO', date '2026-10-23', 944.00,
    v_efectivo, v_caja, v_cobranza, 'DEP-2302', null,
    '[{"comprobante_id":"a0000011-0000-4000-8000-000000000011","amount":944.00}]'::jsonb);

  v_p3 := public.create_payment_with_allocations(
    '00000006-0000-4000-8000-000000000006', 'INGRESO', date '2026-10-23', 354.00,
    v_efectivo, v_caja, v_cobranza, 'DEP-2303', null,
    '[{"comprobante_id":"a0000012-0000-4000-8000-000000000012","amount":354.00}]'::jsonb);

  v_p4 := public.create_payment_with_allocations(
    '00000001-0000-4000-8000-000000000001', 'INGRESO', date '2026-10-23', 649.00,
    v_transfer, v_banco, v_cobranza, 'TRF-2304', null,
    '[{"comprobante_id":"a0000013-0000-4000-8000-000000000013","amount":649.00}]'::jsonb);

  v_p5 := public.create_payment_with_allocations(
    '00000008-0000-4000-8000-000000000008', 'EGRESO', date '2026-10-23', 2360.00,
    v_transfer, v_banco, v_pago_prov, 'TRF-2305', null,
    '[{"comprobante_id":"b0000005-0000-4000-8000-000000000005","amount":2360.00}]'::jsonb);

  v_p6 := public.create_payment_with_allocations(
    '00000009-0000-4000-8000-000000000009', 'EGRESO', date '2026-10-23', 944.00,
    v_transfer, v_banco, v_pago_prov, 'TRF-2306', null,
    '[{"comprobante_id":"b0000006-0000-4000-8000-000000000006","amount":944.00}]'::jsonb);

  v_p7 := public.create_payment_with_allocations(
    null, 'EGRESO', date '2026-10-23', 80.00,
    v_efectivo, v_caja, v_gasto, 'MOV-2307', 'Utiles de oficina',
    '[]'::jsonb);

  v_p8 := public.create_payment_with_allocations(
    '00000003-0000-4000-8000-000000000003', 'INGRESO', date '2026-10-23', 1000.00,
    v_efectivo, v_caja, v_cobranza, 'DEP-2308', null, '[]'::jsonb);

  perform public.mark_payments_processed(array[v_p1, v_p2, v_p3, v_p4, v_p5, v_p6, v_p7]);

  -- Recibo duplicado por error de digitacion.
  update public.payment
     set status = 'ANULADO',
         void_reason = 'Recibo duplicado por error de digitacion',
         voided_at = now()
   where id = v_p8;

  -- Reposicion de efectivo desde el banco.
  perform public.create_cash_transfer(
    v_banco, v_caja, 1500.00, date '2026-10-23',
    'Reposicion de efectivo para vuelto');

  perform public.close_cash_account(
    v_caja, date '2026-10-23', 9666.00, null,
    null, null, 'Yrra Rojas', 'Yrra Rojas');
end $$;

-- =====================================================================
-- BLOQUE 6 — Dia 24 (sab): arqueo sorpresa y diferencia con motivo
-- =====================================================================
do $$
declare
  v_owner     uuid := '7f9e00ea-c5a0-4ddb-b72c-4f6ad912f782';
  v_caja      uuid := '11111111-1111-4111-8111-111111111111';
  v_banco     uuid := '22222222-2222-4222-8222-222222222222';
  v_efectivo  uuid := '37178d46-97b1-4ef9-8f1e-77bef296873c';
  v_transfer  uuid := 'fc385e8d-a036-4199-98f5-8b4cc36ff29c';
  v_cobranza  uuid := '6055077c-fe23-4f10-ab98-3476c410178d';
  v_pago_prov uuid := '7b1886f4-a9ed-44a8-851a-e781e956f0f1';
  v_itf       uuid := '0fbe6be5-6f1e-4df7-9422-eb2828a9506e';
  v_p1 uuid; v_p2 uuid; v_p3 uuid; v_p4 uuid; v_p5 uuid;
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_owner)::text, true);

  v_p1 := public.create_payment_with_allocations(
    '00000002-0000-4000-8000-000000000002', 'INGRESO', date '2026-10-24', 2360.00,
    v_efectivo, v_caja, v_cobranza, 'DEP-2401', null,
    '[{"comprobante_id":"a0000014-0000-4000-8000-000000000014","amount":2360.00}]'::jsonb);

  v_p2 := public.create_payment_with_allocations(
    '00000004-0000-4000-8000-000000000004', 'INGRESO', date '2026-10-24', 472.00,
    v_efectivo, v_caja, v_cobranza, 'DEP-2402', null,
    '[{"comprobante_id":"a0000016-0000-4000-8000-000000000016","amount":472.00}]'::jsonb);

  v_p3 := public.create_payment_with_allocations(
    '00000003-0000-4000-8000-000000000003', 'INGRESO', date '2026-10-24', 1500.00,
    v_transfer, v_banco, v_cobranza, 'TRF-2403', 'Abono parcial FF01-000010',
    '[{"comprobante_id":"a0000015-0000-4000-8000-000000000015","amount":1500.00}]'::jsonb);

  v_p4 := public.create_payment_with_allocations(
    '00000007-0000-4000-8000-000000000007', 'EGRESO', date '2026-10-24', 1475.00,
    v_efectivo, v_caja, v_pago_prov, 'REC-2404', null,
    '[{"comprobante_id":"b0000007-0000-4000-8000-000000000007","amount":1475.00}]'::jsonb);

  v_p5 := public.create_payment_with_allocations(
    null, 'EGRESO', date '2026-10-24', 30.00,
    v_transfer, v_banco, v_itf, 'ITF-2405', 'ITF de la semana',
    '[]'::jsonb);

  perform public.mark_payments_processed(array[v_p1, v_p2, v_p3, v_p4, v_p5]);

  -- Arqueo sorpresa antes del cierre del dia.
  perform public.register_cash_count(
    v_caja, date '2026-10-24', 11023.00, null,
    'Yrra Rojas', 'Arqueo sorpresa de media manana');

  -- Sobrante de 3.00: supera la tolerancia y exige motivo.
  perform public.close_cash_account(
    v_caja, date '2026-10-24', 11026.00, 'Sobrante por vuelto no entregado',
    null, 'Vuelto no registrado en la venta BV01-000004',
    'Yrra Rojas', 'Yrra Rojas');
end $$;

-- =====================================================================
-- BLOQUE 7 — Dia 25 (dom): jornada corta
-- =====================================================================
do $$
declare
  v_owner     uuid := '7f9e00ea-c5a0-4ddb-b72c-4f6ad912f782';
  v_caja      uuid := '11111111-1111-4111-8111-111111111111';
  v_banco     uuid := '22222222-2222-4222-8222-222222222222';
  v_efectivo  uuid := '37178d46-97b1-4ef9-8f1e-77bef296873c';
  v_transfer  uuid := 'fc385e8d-a036-4199-98f5-8b4cc36ff29c';
  v_cobranza  uuid := '6055077c-fe23-4f10-ab98-3476c410178d';
  v_pago_prov uuid := '7b1886f4-a9ed-44a8-851a-e781e956f0f1';
  v_gasto     uuid := 'c6eac462-51ea-4f71-a904-82fbaf120bf9';
  v_p1 uuid; v_p2 uuid; v_p3 uuid; v_p4 uuid;
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_owner)::text, true);

  v_p1 := public.create_payment_with_allocations(
    '00000005-0000-4000-8000-000000000005', 'INGRESO', date '2026-10-25', 1475.00,
    v_efectivo, v_caja, v_cobranza, 'DEP-2501', null,
    '[{"comprobante_id":"a0000017-0000-4000-8000-000000000017","amount":1475.00}]'::jsonb);

  v_p2 := public.create_payment_with_allocations(
    '00000006-0000-4000-8000-000000000006', 'INGRESO', date '2026-10-25', 295.00,
    v_transfer, v_banco, v_cobranza, 'TRF-2502', null,
    '[{"comprobante_id":"a0000018-0000-4000-8000-000000000018","amount":295.00}]'::jsonb);

  v_p3 := public.create_payment_with_allocations(
    '00000008-0000-4000-8000-000000000008', 'EGRESO', date '2026-10-25', 826.00,
    v_transfer, v_banco, v_pago_prov, 'TRF-2503', null,
    '[{"comprobante_id":"b0000008-0000-4000-8000-000000000008","amount":826.00}]'::jsonb);

  v_p4 := public.create_payment_with_allocations(
    null, 'EGRESO', date '2026-10-25', 50.00,
    v_efectivo, v_caja, v_gasto, 'MOV-2504', 'Limpieza del local',
    '[]'::jsonb);

  perform public.mark_payments_processed(array[v_p1, v_p2, v_p3, v_p4]);

  perform public.close_cash_account(
    v_caja, date '2026-10-25', 12448.00, null,
    null, null, 'Yrra Rojas', 'Yrra Rojas');
end $$;

-- =====================================================================
-- BLOQUE 8 — Dia 26 (lun): anticipo sin asignar y transferencia caja -> banco
-- =====================================================================
do $$
declare
  v_owner     uuid := '7f9e00ea-c5a0-4ddb-b72c-4f6ad912f782';
  v_caja      uuid := '11111111-1111-4111-8111-111111111111';
  v_banco     uuid := '22222222-2222-4222-8222-222222222222';
  v_efectivo  uuid := '37178d46-97b1-4ef9-8f1e-77bef296873c';
  v_transfer  uuid := 'fc385e8d-a036-4199-98f5-8b4cc36ff29c';
  v_cobranza  uuid := '6055077c-fe23-4f10-ab98-3476c410178d';
  v_anticipo  uuid := '0da485fc-5544-4c53-946a-b53e01513629';
  v_pago_prov uuid := '7b1886f4-a9ed-44a8-851a-e781e956f0f1';
  v_retiro    uuid := '0e838897-95a5-443a-9168-4307f119e7d4';
  v_p1 uuid; v_p2 uuid; v_p3 uuid; v_p4 uuid; v_p5 uuid; v_p6 uuid; v_p7 uuid; v_p8 uuid;
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_owner)::text, true);

  v_p1 := public.create_payment_with_allocations(
    '00000001-0000-4000-8000-000000000001', 'INGRESO', date '2026-10-26', 4000.00,
    v_transfer, v_banco, v_cobranza, 'TRF-2601', 'Abono parcial FF01-000012',
    '[{"comprobante_id":"a0000019-0000-4000-8000-000000000019","amount":4000.00}]'::jsonb);

  v_p2 := public.create_payment_with_allocations(
    '00000002-0000-4000-8000-000000000002', 'INGRESO', date '2026-10-26', 1770.00,
    v_efectivo, v_caja, v_cobranza, 'DEP-2602', null,
    '[{"comprobante_id":"a0000020-0000-4000-8000-000000000020","amount":1770.00}]'::jsonb);

  v_p3 := public.create_payment_with_allocations(
    '00000003-0000-4000-8000-000000000003', 'INGRESO', date '2026-10-26', 2360.00,
    v_transfer, v_banco, v_cobranza, 'TRF-2603', null,
    '[{"comprobante_id":"a0000021-0000-4000-8000-000000000021","amount":2360.00}]'::jsonb);

  v_p4 := public.create_payment_with_allocations(
    '00000004-0000-4000-8000-000000000004', 'INGRESO', date '2026-10-26', 708.00,
    v_efectivo, v_caja, v_cobranza, 'DEP-2604', null,
    '[{"comprobante_id":"a0000022-0000-4000-8000-000000000022","amount":708.00}]'::jsonb);

  v_p5 := public.create_payment_with_allocations(
    '00000005-0000-4000-8000-000000000005', 'INGRESO', date '2026-10-26', 500.00,
    v_efectivo, v_caja, v_anticipo, 'DEP-2605',
    'Anticipo para la proxima factura', '[]'::jsonb);

  v_p6 := public.create_payment_with_allocations(
    '00000007-0000-4000-8000-000000000007', 'EGRESO', date '2026-10-26', 3540.00,
    v_transfer, v_banco, v_pago_prov, 'TRF-2606', null,
    '[{"comprobante_id":"b0000009-0000-4000-8000-000000000009","amount":3540.00}]'::jsonb);

  v_p7 := public.create_payment_with_allocations(
    '00000009-0000-4000-8000-000000000009', 'EGRESO', date '2026-10-26', 1180.00,
    v_transfer, v_banco, v_pago_prov, 'TRF-2607', null,
    '[{"comprobante_id":"b0000010-0000-4000-8000-000000000010","amount":1180.00}]'::jsonb);

  v_p8 := public.create_payment_with_allocations(
    null, 'EGRESO', date '2026-10-26', 200.00,
    v_efectivo, v_caja, v_retiro, 'RET-2608', 'Retiro del propietario',
    '[]'::jsonb);

  -- El anticipo queda en revision a proposito (recibo sin asignar visible en UI).
  perform public.mark_payments_processed(array[v_p1, v_p2, v_p3, v_p4, v_p6, v_p7, v_p8]);

  perform public.create_cash_transfer(
    v_caja, v_banco, 2000.00, date '2026-10-26',
    'Deposito del efectivo acumulado');

  perform public.close_cash_account(
    v_caja, date '2026-10-26', 13226.00, null,
    null, null, 'Yrra Rojas', 'Yrra Rojas');
end $$;

-- =====================================================================
-- BLOQUE 9 — Dia 27 (mar): cierre de caja por denominaciones y cierre del banco
-- =====================================================================
do $$
declare
  v_owner     uuid := '7f9e00ea-c5a0-4ddb-b72c-4f6ad912f782';
  v_caja      uuid := '11111111-1111-4111-8111-111111111111';
  v_banco     uuid := '22222222-2222-4222-8222-222222222222';
  v_efectivo  uuid := '37178d46-97b1-4ef9-8f1e-77bef296873c';
  v_transfer  uuid := 'fc385e8d-a036-4199-98f5-8b4cc36ff29c';
  v_cobranza  uuid := '6055077c-fe23-4f10-ab98-3476c410178d';
  v_pago_prov uuid := '7b1886f4-a9ed-44a8-851a-e781e956f0f1';
  v_comision  uuid := '90fc9171-4a3a-40a7-bb9e-069c121034c4';
  v_p1 uuid; v_p2 uuid; v_p3 uuid; v_p4 uuid; v_p5 uuid; v_p6 uuid; v_p7 uuid;
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_owner)::text, true);

  v_p1 := public.create_payment_with_allocations(
    '00000006-0000-4000-8000-000000000006', 'INGRESO', date '2026-10-27', 3540.00,
    v_transfer, v_banco, v_cobranza, 'TRF-2701', null,
    '[{"comprobante_id":"a0000024-0000-4000-8000-000000000024","amount":3540.00}]'::jsonb);

  v_p2 := public.create_payment_with_allocations(
    '00000001-0000-4000-8000-000000000001', 'INGRESO', date '2026-10-27', 2360.00,
    v_efectivo, v_caja, v_cobranza, 'DEP-2702', null,
    '[{"comprobante_id":"a0000025-0000-4000-8000-000000000025","amount":2360.00}]'::jsonb);

  v_p3 := public.create_payment_with_allocations(
    '00000002-0000-4000-8000-000000000002', 'INGRESO', date '2026-10-27', 1180.00,
    v_transfer, v_banco, v_cobranza, 'TRF-2703', null,
    '[{"comprobante_id":"a0000026-0000-4000-8000-000000000026","amount":1180.00}]'::jsonb);

  v_p4 := public.create_payment_with_allocations(
    '00000003-0000-4000-8000-000000000003', 'INGRESO', date '2026-10-27', 413.00,
    v_efectivo, v_caja, v_cobranza, 'DEP-2704', null,
    '[{"comprobante_id":"a0000027-0000-4000-8000-000000000027","amount":413.00}]'::jsonb);

  v_p5 := public.create_payment_with_allocations(
    '00000004-0000-4000-8000-000000000004', 'INGRESO', date '2026-10-27', 590.00,
    v_transfer, v_banco, v_cobranza, 'TRF-2705', null,
    '[{"comprobante_id":"a0000028-0000-4000-8000-000000000028","amount":590.00}]'::jsonb);

  v_p6 := public.create_payment_with_allocations(
    '00000009-0000-4000-8000-000000000009', 'EGRESO', date '2026-10-27', 590.00,
    v_efectivo, v_caja, v_pago_prov, 'REC-2706', null,
    '[{"comprobante_id":"b0000012-0000-4000-8000-000000000012","amount":590.00}]'::jsonb);

  v_p7 := public.create_payment_with_allocations(
    null, 'EGRESO', date '2026-10-27', 25.00,
    v_transfer, v_banco, v_comision, 'COM-2707', 'Comision por transferencia',
    '[]'::jsonb);

  -- Los recibos del ultimo dia quedan en revision, como en la operacion real.

  perform public.close_cash_account(
    v_caja, date '2026-10-27', 15409.00, 'Cierre del dia con conteo de billetes',
    '[{"denomination":200,"quantity":70},{"denomination":100,"quantity":10},
      {"denomination":50,"quantity":8},{"denomination":5,"quantity":1},
      {"denomination":2,"quantity":2}]'::jsonb,
    null, 'Yrra Rojas', 'Yrra Rojas');

  -- Cierre semanal del banco (periodicidad mensual, periodo 20 -> 27 oct).
  perform public.close_cash_account(
    v_banco, date '2026-10-27', 24194.00, 'Cierre semanal de la cuenta corriente',
    null, null, 'Yrra Rojas', 'Yrra Rojas');
end $$;
