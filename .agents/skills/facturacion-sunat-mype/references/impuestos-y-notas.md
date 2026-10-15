# Impuestos y notas de crédito/débito (SUNAT, Perú)

> Reglas orientativas para construir software. Confirma tasas y catálogos vigentes con SUNAT o el contador.

## IGV y precio

- **IGV = 18%** = 16% IGV + 2% IPM.
- El precio de venta al público **incluye** el IGV.
  - Base = Total ÷ 1.18 · IGV = Total − Base.
  - Total = Base × 1.18.
- Redondeo: define una sola regla (recomendado: 2 decimales, redondeo por línea y ajuste en el total) y úsala igual en pantalla, BD e impresión.

## Condición tributaria de la operación

| Condición | Efecto |
| --- | --- |
| Gravado | Paga IGV (18%) |
| Exonerado | Sin IGV por ley (ej. bienes/servicios del Apéndice) |
| Inafecto | Fuera del ámbito del IGV |
| Exportación | Tasa 0%; tratamiento y sustento propios |

En el comprobante conviene guardar, por línea y por total, cuánto es gravado, exonerado e inafecto.

## Regímenes especiales (existen; evalúa si aplican)

- **Retención del IGV:** el agente retiene un porcentaje al proveedor (comúnmente 3%).
- **Percepción del IGV:** se cobra un adicional al cliente (comúnmente 2%).
- **Detracción (SPOT):** depósito en cuenta del Banco de la Nación para ciertos servicios; usa una **constancia de depósito**.
- Cada uno exige su propio comprobante y afecta a rubros específicos. No los implementes "por si acaso": confírmalo con el contador.

## Notas de crédito — motivos frecuentes

| Código | Motivo |
| --- | --- |
| 01 | Anulación de la operación |
| 02 | Anulación por error en el RUC |
| 03 | Corrección por error en la descripción |
| 04 | Descuento global |
| 05 | Descuento por ítem |
| 06 | Devolución total |
| 07 | Devolución por ítem |
| 09 | Disminución en el valor |
| 10 | Otros conceptos |

Una NC **disminuye** el importe y ajusta el IGV; siempre referencia el comprobante original.

## Notas de débito — motivos frecuentes

| Código | Motivo |
| --- | --- |
| 01 | Intereses por mora |
| 02 | Aumento en el valor |
| 03 | Penalidades / otros conceptos |

Una ND **aumenta** el importe; también referencia el comprobante original.

## Sugerencias de software

- Modela la NC/ND como un comprobante con su propia serie/correlativo y un campo **comprobante_referenciado**.
- Valida que el motivo exista en el catálogo y que el monto no rompa el saldo del comprobante original.
- Nunca edites el comprobante original para "corregir": emite NC/ND.
