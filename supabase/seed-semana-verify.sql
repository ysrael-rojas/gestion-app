-- Verificacion del seed semanal (21-27 oct 2026)
-- Ejecutar con el MCP de Supabase (execute_sql). Solo lectura: no modifica nada.
-- Todas las columnas de control deben salir en 0 salvo las marcadas como dato.

-- 1) Integridad de comprobantes y pagos
with tot as (
  select c.id, c.total,
         coalesce(sum(a.amount) filter (where p.status <> 'ANULADO'), 0) paid,
         coalesce((select sum(n.total) from comprobante n
                    where n.referenced_comprobante_id = c.id and n.deleted_at is null
                      and n.voucher_type in ('NOTA_CREDITO','COMPROBANTE_RETENCION')), 0) credit,
         coalesce((select sum(n.total) from comprobante n
                    where n.referenced_comprobante_id = c.id and n.deleted_at is null
                      and n.voucher_type = 'NOTA_DEBITO'), 0) debit,
         c.status::text status
    from comprobante c
    left join payment_allocation a on a.comprobante_id = c.id
    left join payment p on p.id = a.payment_id
   group by c.id
)
select
  (select count(*) from tot where paid + credit > total + debit) as sobrepagados,
  (select count(*) from tot where status = 'PAGADO' and paid + credit < total + debit) as pagados_con_saldo,
  (select count(*) from tot where status = 'PENDIENTE' and paid + credit >= total + debit) as pendientes_sin_saldo;

-- 2) Cadena de cierres: apertura = esperado del dia anterior, esperado = saldo real
select
  count(*) filter (where opening_balance <> private.cash_expected_balance(cash_account_id, period_start - 1)) as aperturas_incoherentes,
  count(*) filter (where expected_balance <> private.cash_expected_balance(cash_account_id, period_end)) as esperados_incoherentes,
  count(*) filter (where period_end > current_date) as cierres_futuros
from cash_close;

-- 3) Caja nunca negativa en la semana
select min(private.cash_expected_balance('11111111-1111-4111-8111-111111111111', d::date)) as caja_minima
from generate_series(date '2026-10-20', date '2026-10-27', interval '1 day') d;

-- 4) Correlativos: recibos y series sincronizados con lo sembrado
select
  (select last_serial from receipt_sequence where direction = 'INGRESO') as ultimo_ri,
  (select count(*) from payment where direction = 'INGRESO') as recibos_ingreso,
  (select last_serial from receipt_sequence where direction = 'EGRESO') as ultimo_re,
  (select count(*) from payment where direction = 'EGRESO') as recibos_egreso,
  (select string_agg(code || '=' || last_number, ' ' order by code)
     from voucher_series where owner_id = '7f9e00ea-c5a0-4ddb-b72c-4f6ad912f782') as series;

-- 5) Cartera esperada (las 4 tarjetas del resumen deben tener datos)
select
  (select count(*) from comprobante c
    where c.voucher_kind = 'VENTA' and c.status = 'PENDIENTE' and c.deleted_at is null) as documentos_por_cobrar,
  (select count(*) from comprobante c
    where c.voucher_kind = 'COMPRA' and c.status = 'PENDIENTE' and c.deleted_at is null) as documentos_por_pagar,
  (select count(*) from payment p
    where p.status <> 'ANULADO'
      and not exists (select 1 from payment_allocation a where a.payment_id = p.id)) as recibos_sin_asignar;

-- 6) Disponible hoy (28 oct, sin movimientos ni cierre)
select
  private.cash_expected_balance('11111111-1111-4111-8111-111111111111', current_date) as caja_hoy,
  private.cash_expected_balance('22222222-2222-4222-8222-222222222222', current_date) as banco_hoy;

-- 7) Volumen sembrado
select
  (select count(*) from comprobante where voucher_kind = 'VENTA') as ventas,
  (select count(*) from comprobante where voucher_kind = 'COMPRA') as compras,
  (select count(*) from payment) as recibos,
  (select count(*) from payment_allocation) as asignaciones,
  (select count(*) from cash_close) as cierres,
  (select count(*) from cash_transfer) as transferencias,
  (select count(*) from cash_count) as arqueos;
