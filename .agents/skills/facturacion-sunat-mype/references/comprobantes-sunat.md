# Comprobantes de pago — catálogo y datos obligatorios (SUNAT, Perú)

> Reglas orientativas para construir software. Confirma siempre la vigencia con SUNAT o el contador: cambian por resolución.

## Catálogo

| Comprobante | Para qué | Da crédito fiscal / gasto |
| --- | --- | --- |
| **Factura** | Cliente con **RUC** (empresa o persona con negocio). Operaciones de venta. | Sí (crédito fiscal del IGV) |
| **Boleta de venta** | Consumidor final o cliente **sin RUC**. | No da crédito fiscal al cliente |
| **Nota de crédito (NC)** | Anular, descontar o corregir un comprobante ya emitido. | Ajusta el IGV de la operación original |
| **Nota de débito (ND)** | Intereses por mora, penalidad o aumento del valor. | Aumenta el importe |
| **Guía de remisión (remitente/transportista)** | Traslado de mercadería. | No es venta; sustenta el traslado |
| **Recibo por Honorarios (RHE)** | Servicio de persona natural sin empresa (4ta categoría). | Sustenta gasto del que lo recibe |
| **Liquidación de compra** | Compra a quien no emite comprobante (ej. agricultor sin RUC). | Sustenta el gasto |
| **Ticket / máquina registradora** | Ventas al público (uso autorizado). | No da crédito fiscal |
| **Comprobante de retención / percepción** | Regímenes de retención o percepción del IGV. | Sustenta el régimen aplicado |

## Cuándo usar factura vs boleta

- **Factura:** el cliente tiene RUC y quiere usar el gasto (crédito fiscal).
- **Boleta:** consumidor final; se puede consignar el DNI. Cuando la venta supera cierto monto (**umbral de S/ 700**, verifica el vigente) se debe registrar **nombre y DNI** del comprador.
- No se emite factura a un comprador sin RUC.

## Datos mínimos de una venta (factura o boleta)

- Serie y **número correlativo** (sin saltos).
- Fecha de emisión.
- Datos del emisor (RUC, razón social, dirección).
- Datos del adquirente: **RUC** (factura) o **DNI/nombre** (boleta según monto).
- Descripción del bien o servicio, cantidad, valor unitario.
- **Base imponible**, **IGV**, otros tributos y **total**.
- Condición: **contado** o **crédito** (con vencimiento).
- Moneda.
- Comprobante que modifica (solo en NC/ND).

## Sugerencias para el modelo de datos

- Guarda tipo, serie, correlativo, y un **índice único (tipo, serie, correlativo)**.
- Guarda la base y el IGV calculados **en el comprobante**, no solo derivados, para que el histórico no cambie si mañana cambia una tasa.
- El comprobante emitido es **inmutable**: los cambios se hacen con NC/ND.
- Mantén el **vínculo** NC/ND → comprobante original (el reporte fiscal lo necesita).
