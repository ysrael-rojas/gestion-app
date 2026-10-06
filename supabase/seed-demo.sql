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
end $$;
