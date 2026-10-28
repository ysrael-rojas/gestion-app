-- Verificacion de integridad entre usuarios (SPEC 57)
--
-- Ejecutar BLOQUE POR BLOQUE con el MCP (execute_sql) o psql. Cada bloque es una
-- transaccion que termina en ROLLBACK: no deja usuarios, cuentas ni filas.
--
-- En los bloques 1 a 5 el resultado esperado es un error 42501 (permiso denegado
-- o trigger de consistencia). En el bloque 6 el resultado esperado es exito.
--
-- Usuario intruso fijo: 99999999-9999-4999-8999-999999999999
-- Owner real:          7f9e00ea-c5a0-4ddb-b72c-4f6ad912f782
-- Cuenta real:         11111111-1111-4111-8111-111111111111
-- Comprobante real:    a0000003-0000-4000-8000-000000000003

-- ===========================================================================
-- BLOQUE 1 — Pago contra una cuenta de otro usuario (debe fallar 42501)
-- ===========================================================================
begin;
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('99999999-9999-4999-8999-999999999999', 'authenticated', 'authenticated',
        'auditoria@example.com', 'x', now(), now(), now());

set local role authenticated;
set local request.jwt.claims = '{"sub":"99999999-9999-4999-8999-999999999999"}';

select public.create_payment_with_allocations(
  '00000003-0000-4000-8000-000000000003', 'INGRESO', current_date, 1.00,
  '37178d46-97b1-4ef9-8f1e-77bef296873c',
  '11111111-1111-4111-8111-111111111111',
  '6055077c-fe23-4f10-ab98-3476c410178d',
  'AUDIT-1', null, '[]'::jsonb);
rollback;

-- ===========================================================================
-- BLOQUE 2 — Asignacion a un comprobante de otro usuario (debe fallar 42501)
-- ===========================================================================
begin;
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('99999999-9999-4999-8999-999999999999', 'authenticated', 'authenticated',
        'auditoria@example.com', 'x', now(), now(), now());

-- Fixtures del intruso (como postgres, antes de impersonar).
insert into public.cash_account (id, owner_id, type, name, currency, opening_balance_date)
values ('88888888-8888-4888-8888-888888888888', '99999999-9999-4999-8999-999999999999',
        'CASH_BOX', 'Caja intruso', 'PEN', current_date);
insert into public.payment_method (id, owner_id, code, name)
values ('77777777-7777-4777-8777-777777777777', '99999999-9999-4999-8999-999999999999',
        'TEST', 'Test');
insert into public.cash_receipt_category (id, owner_id, code, name, direction)
values ('66666666-6666-4666-8666-666666666666', '99999999-9999-4999-8999-999999999999',
        'TEST', 'Test', 'INGRESO');
insert into public.payment (id, owner_id, direction, payment_date, amount, method_id, cash_account_id, category_id)
values ('55555555-5555-4555-8555-555555555555', '99999999-9999-4999-8999-999999999999',
        'INGRESO', current_date, 1.00,
        '77777777-7777-4777-8777-777777777777',
        '88888888-8888-4888-8888-888888888888',
        '66666666-6666-4666-8666-666666666666');

set local role authenticated;
set local request.jwt.claims = '{"sub":"99999999-9999-4999-8999-999999999999"}';

insert into public.payment_allocation (payment_id, comprobante_id, amount)
values ('55555555-5555-4555-8555-555555555555',
        'a0000003-0000-4000-8000-000000000003', 1.00);
rollback;

-- ===========================================================================
-- BLOQUE 3 — Cierre con una cuenta ajena (debe fallar)
--   3a) Como authenticated: sin INSERT directo (permiso denegado).
--   3b) Como postgres: el trigger de consistencia lo rechaza.
-- ===========================================================================
begin;
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('99999999-9999-4999-8999-999999999999', 'authenticated', 'authenticated',
        'auditoria@example.com', 'x', now(), now(), now());

set local role authenticated;
set local request.jwt.claims = '{"sub":"99999999-9999-4999-8999-999999999999"}';

insert into public.cash_close (
  owner_id, cash_account_id, periodicity, period_start, period_end,
  opening_balance, expected_balance, counted_balance
) values (
  '99999999-9999-4999-8999-999999999999',
  '11111111-1111-4111-8111-111111111111', 'DAILY', current_date, current_date,
  0, 0, 0
);
rollback;

begin;
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('99999999-9999-4999-8999-999999999999', 'authenticated', 'authenticated',
        'auditoria@example.com', 'x', now(), now(), now());

insert into public.cash_close (
  owner_id, cash_account_id, periodicity, period_start, period_end,
  opening_balance, expected_balance, counted_balance
) values (
  '99999999-9999-4999-8999-999999999999',
  '11111111-1111-4111-8111-111111111111', 'DAILY', current_date, current_date,
  0, 0, 0
);
rollback;

-- ===========================================================================
-- BLOQUE 4 — Transferencia con cuentas ajenas (debe fallar)
--   4a) Como authenticated: sin INSERT directo.
--   4b) Como postgres: el trigger de consistencia la rechaza.
-- ===========================================================================
begin;
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('99999999-9999-4999-8999-999999999999', 'authenticated', 'authenticated',
        'auditoria@example.com', 'x', now(), now(), now());

set local role authenticated;
set local request.jwt.claims = '{"sub":"99999999-9999-4999-8999-999999999999"}';

insert into public.cash_transfer (owner_id, source_account_id, target_account_id, amount, transfer_date)
values ('99999999-9999-4999-8999-999999999999',
        '11111111-1111-4111-8111-111111111111',
        '22222222-2222-4222-8222-222222222222', 1.00, current_date);
rollback;

begin;
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('99999999-9999-4999-8999-999999999999', 'authenticated', 'authenticated',
        'auditoria@example.com', 'x', now(), now(), now());

insert into public.cash_transfer (owner_id, source_account_id, target_account_id, amount, transfer_date)
values ('99999999-9999-4999-8999-999999999999',
        '11111111-1111-4111-8111-111111111111',
        '22222222-2222-4222-8222-222222222222', 1.00, current_date);
rollback;

-- ===========================================================================
-- BLOQUE 5 — Comprobante con una entidad ajena (debe fallar 42501)
-- ===========================================================================
begin;
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('99999999-9999-4999-8999-999999999999', 'authenticated', 'authenticated',
        'auditoria@example.com', 'x', now(), now(), now());

set local role authenticated;
set local request.jwt.claims = '{"sub":"99999999-9999-4999-8999-999999999999"}';

insert into public.comprobante (
  owner_id, entity_id, voucher_kind, voucher_type, voucher_number,
  issue_date, registration_date, subtotal, igv, total, payment_type
) values (
  '99999999-9999-4999-8999-999999999999',
  '00000001-0000-4000-8000-000000000001',
  'VENTA', 'FACTURA', 'FT01-99999', current_date, current_date,
  100, 18, 118, 'CONTADO'
);
rollback;

-- ===========================================================================
-- BLOQUE 6 — Flujo normal del owner real (debe pasar)
--   Se ejecuta con claims del owner (las RPC son SECURITY DEFINER y validan
--   auth.uid(), no el rol de sesion); asi se puede calcular el esperado con la
--   funcion privada antes del cierre.
-- ===========================================================================
begin;
do $$
declare
  v_expected numeric(12,2);
begin
  perform set_config(
    'request.jwt.claims',
    '{"sub":"7f9e00ea-c5a0-4ddb-b72c-4f6ad912f782"}',
    true
  );

  perform public.create_payment_with_allocations(
    '00000003-0000-4000-8000-000000000003', 'INGRESO', current_date, 1.00,
    '37178d46-97b1-4ef9-8f1e-77bef296873c',
    '11111111-1111-4111-8111-111111111111',
    '6055077c-fe23-4f10-ab98-3476c410178d',
    'OK-1', null,
    '[{"comprobante_id":"a0000003-0000-4000-8000-000000000003","amount":1.00}]'::jsonb
  );

  perform public.create_cash_transfer(
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222', 1.00, current_date,
    'Verificacion SPEC 57'
  );

  v_expected := private.cash_expected_balance(
    '11111111-1111-4111-8111-111111111111', current_date
  );

  perform public.close_cash_account(
    '11111111-1111-4111-8111-111111111111', current_date, v_expected,
    'Verificacion SPEC 57', null, null, 'Test', 'Test'
  );
end $$;
rollback;

-- Comprobacion final (fuera de los bloques): solo debe quedar el owner real.
-- select count(*) from auth.users;
