-- SPEC 39: nuevos tipos de comprobante para notas de crédito/débito y comprobante de retención.
--
-- Los valores del enum van en su propia migración: Postgres no permite *usar* un valor
-- recién agregado dentro de la misma transacción en que se agrega, y la migración 2
-- (spec39_comprobante_ajustes_y_saldos) ya los usa. Aplicada vía MCP el 2026-10-17.
alter type public.voucher_type add value if not exists 'NOTA_CREDITO';
alter type public.voucher_type add value if not exists 'NOTA_DEBITO';
alter type public.voucher_type add value if not exists 'COMPROBANTE_RETENCION';
