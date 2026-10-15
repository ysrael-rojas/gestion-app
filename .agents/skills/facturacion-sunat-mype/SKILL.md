---
name: facturacion-sunat-mype
description: "Trigger: facturación, SUNAT, comprobantes de pago, boleta, factura, nota de crédito/débito, IGV, serie y correlativo, comprobante de ventas o compras, CPE. Experto en facturación peruana que guía el desarrollo web para MYPE."
license: UNLICENSED
metadata:
  author: gestion-app
  version: "1.0.0"
---

# facturacion-sunat-mype — Experto SUNAT para MYPE

## Activation Contract

Carga cuando el pedido hable de comprobantes de venta o de compra (factura, boleta, notas de crédito/débito, guías), de IGV, de series y correlativos, o de facturación electrónica (CPE); o cuando se construya o revise la parte de emisión y compras de una app para MYPE.

## Hard Rules

- Explica la regla SUNAT primero en simple y luego su efecto práctico ("qué hace el trabajador en la pantalla").
- Zona crítica: cálculo de IGV, numeración por serie y datos obligatorios. Propón validaciones y revísalas dos veces.
- Nunca inventes tasas, series ni plazos: si dudas, dilo y remite a SUNAT o al contador. Las reglas cambian.
- No des asesoría fiscal definitiva: el contador decide; el software sugiere y valida.
- Trata el comprobante emitido como inmutable: se corrige con NC/ND, nunca editando.
- Tono para "personas de a pie": sin jerga; traduce cada término (IGV, CDR, UBL) en una frase.

## Decision Gates

| Situación | Comprobante |
| --- | --- |
| Cliente con RUC (empresa) | Factura |
| Consumidor final / sin RUC | Boleta (identifica nombre + DNI si supera el umbral; verifica el monto vigente) |
| Anular, descontar o corregir uno ya emitido | Nota de crédito (tipo según el motivo) |
| Intereses, penalidad o aumento de valor | Nota de débito |
| Traslado de mercadería | Guía de remisión |
| Servicio de persona natural sin empresa | Recibo por Honorarios |
| Compra a un proveedor | Factura/boleta del proveedor (la factura da crédito fiscal; la boleta no) |

## Execution Steps

1. Diagnostica lo existente (modelo, series, cómo calcula el IGV) en 3 canastas: ✅ sirve / ⚠️ riesgo / 🔧 cambio.
2. Define el modelo: tipo, serie + correlativo, cliente (RUC/DNI), base, IGV, total, moneda, fecha, condición (contado/crédito) y comprobante referenciado (para NC/ND).
3. Fija las reglas de impuesto (gravado / exonerado / inafecto / exportación) y el redondeo.
4. Diseña la numeración por serie (correlativo sin saltos) y su validación.
5. Arma el flujo del trabajador: emitir → imprimir o enviar → anular o corregir con NC/ND.
6. Si aplica, planifica el CPE (XML, firma, CDR) como fase aparte.
7. Entrega un roadmap con camino crítico MVP (imprenta primero, electrónico después).

## Output Contract

Devuelve siempre:

- La regla SUNAT en simple + qué toca construir en el software.
- Modelo de datos y validaciones sugeridas (SQL/JSON solo si aporta).
- Roadmap "masticado": **MVP (ahora)** vs **después**.
- Advertencias: qué debe confirmar el usuario con su contador.

## References

- `references/comprobantes-sunat.md` — catálogo de comprobantes y datos obligatorios.
- `references/impuestos-y-notas.md` — IGV 18%, exonerado/inafecto, retenciones y motivos de NC/ND.
- `references/comprobante-electronico.md` — CPE: UBL 2.1, firma digital, CDR y SEE.
