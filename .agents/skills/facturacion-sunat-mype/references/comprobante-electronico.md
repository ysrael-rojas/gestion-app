# Comprobante electrónico (CPE) — cómo se conecta al software

> Orientación general. La obligatoriedad, plazos y catálogos cambian por resolución: confirma con SUNAT o un OSE/PSE.

## Qué es, en simple

Un comprobante electrónico es el mismo documento (factura, boleta, NC, ND) pero **generado como archivo digital**, **firmado** y **enviado** a SUNAT, que responde con una **constancia**. El papel deja de ser el original; el XML firmado lo es.

## Piezas

- **XML UBL 2.1** — el documento digital con todos los datos.
- **Firma digital** — un certificado (sello) que garantiza que no se alteró.
- **CDR** — "constancia de recepción" (el acuse de SUNAT): aceptado o con observaciones/errores.
- **SEE** — el servicio de SUNAT que recibe y valida.
- **PSE / OSE** — proveedores que actúan de puente con SUNAT (útiles si no quieres integrarte directo).

## Flujo típico

1. El sistema arma el XML (UBL 2.1) con serie/correlativo y datos del comprobante.
2. Firmar el XML con el certificado digital.
3. Enviar a SUNAT (directo o vía PSE/OSE).
4. Recibir el **CDR**; si aceptado, el comprobante es válido; si hay error, se corrige y reintenta.
5. Guardar el XML, el CDR y el **estado** (aceptado / rechazado / pendiente de envío).

## Reglas de oro para el software

- **Cola de envío con reintentos**: la red falla; no pierdas comprobantes. Cada intento debe ser **idempotente** (no duplicar el comprobante).
- Guarda **XML + CDR** inmutables por comprobante (respaldo fiscal).
- El **estado electrónico** es un ciclo: pendiente → enviado → aceptado / rechazado. Los rechazados se resuelven, no se borran.
- Series y correlativos deben ser **sin saltos**; el correlativo se reserva antes de enviar.
- No almacenes el certificado ni sus claves en el cliente (frontend): solo en el servidor.

## Camino crítico (MYPE)

1. **MVP — imprenta:** factura/boleta/NC/ND impresas con numeración válida y buenos datos. Es lo que resuelve el día a día.
2. **Luego — CPE:** integrar XML + firma + CDR (vía PSE para arrancar más rápido).
3. **Después:** reportes fiscales (ventas/compras), conciliación con contabilidad y conservación de archivos.
