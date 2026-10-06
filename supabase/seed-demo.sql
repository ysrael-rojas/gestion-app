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
end $$;
