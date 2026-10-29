-- Catch-up (SPEC 60): el valor 'PROCESADO' del enum payment_status se agregó
-- en producción fuera de una migración, así que el historial del repo no lo
-- reproducía y `db push` fallaba en 20261012221550_harden_financial_history_v1.
--
-- Se versiona aquí, antes de la migración que lo usa y en la misma posición
-- que ocupa en producción (entre EN_REVISION y ANULADO).
alter type public.payment_status add value if not exists 'PROCESADO' before 'ANULADO';
