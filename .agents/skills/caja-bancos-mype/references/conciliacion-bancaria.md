# Conciliación bancaria

## Concepto

La conciliación bancaria es **comparar el extracto del banco con tus registros** para
asegurar que ambos dicen lo mismo, y explicar toda diferencia. En palabras simples: el banco
tiene su versión de cuánto dinero tienes; tú tienes la tuya; la conciliación las reconcilia
y deja por escrito por qué no coinciden (casi siempre por cuestión de tiempos o cargos
automáticos, no por errores).

El objetivo es **detectar a tiempo**: depósitos que el banco no registró, cheques/pagos que
aún no cobran, cargos automáticos (ITF, comisiones) que no anotaste, y movimientos no
autorizados.

## Cuándo hacerla

- **Mensual**: al cierre de cada mes, obligatorio para toda cuenta bancaria.
- **Por períodos**: cuando necesitas cortar (quincena, semana, cierre de ejercicio).
- **Al detectar un descuadre**: de inmediato, sin esperar al mes.

## Materiales

1. **Extracto bancario** del período (estado de cuenta del banco).
2. **Registro de bancos** (tu listado de movimientos de la cuenta en tu sistema o cuaderno).
3. Conciliaciones del período anterior (para arrastrar partidas pendientes).

## Procedimiento paso a paso

1. **Compara saldos**: anota el saldo final del extracto y el saldo final de tu registro.
2. **Marca coincidencias**: cruza movimiento por movimiento (depósitos, pagos, transferencias)
   y marca los que están en ambos lados.
3. **Identifica partidas pendientes** — movimientos que están en un lado y no en el otro:
   - **Depósitos/transferencias en tránsito**: tú ya los registraste, el banco aún no (hechos
     a última hora o que el banco abonará al día siguiente).
   - **Cheques/pagos girados y no cobrados**: tú ya los registraste como salida, el banco
     aún no los descuenta (el beneficiario no lo ha cobrado).
   - **Cargos del banco no registrados por ti**: comisiones, mantenimiento, ITF, detracciones
     debitadas, cheques devueltos/protestados.
   - **Abonos del banco no registrados por ti**: intereses, notas de crédito, transferencias
     recibidas que aún no anotaste.
4. **Construye el formato de conciliación** (abajo) partiendo del saldo del extracto.
5. **Verifica el resultado**: el saldo conciliado debe coincidir con tu registro. Si no, hay
   un error por encontrar (registro duplicado, monto mal digitado, movimiento omitido).
6. **Firma y archiva**: elaborador y revisor, y guarda la conciliación junto al extracto.

## Formato estándar de conciliación

```
CONCILIACIÓN BANCARIA
Banco: ____________  Cuenta: ____________  Moneda: S/  Período: _______

SALDO SEGÚN EXTRACTO BANCARIO                     S/ __________
  (+) Depósitos/transferencias en tránsito       S/ __________
  (-) Cheques/pagos girados y no cobrados        S/ __________
  (-) Cargos del banco no registrados            S/ __________
        (comisiones, ITF, detracciones, etc.)
  (+) Abonos del banco no registrados            S/ __________
---------------------------------------------------------------
SALDO CONCILIADO                                 S/ __________
SALDO SEGÚN MIS REGISTROS                        S/ __________
DIFERENCIA                                       S/ __________

Elaborado por: __________  Revisado por: __________  Fecha: ________
```

## ITF (Impuesto a las Transacciones Financieras)

- Tasa vigente: **0.005%** sobre el monto de cada operación bancaria (SUNAT, gob.pe).
- Aplica a operaciones en soles y moneda extranjera por el sistema financiero.
- Ejemplos: depósito de S/ 2,000 → ITF S/ 0.10; transferencia de S/ 10,000 → S/ 0.50.
- En la conciliación aparece como un **cargo pequeño automático** en el extracto; muchas
  veces es la causa de diferencias de centavos. Regístralo para que no queden "diferencias
  de redondeo" sin explicar.

## Detracciones SPOT (Sistema de Pago de Obligaciones Tributarias)

- Mecanismo por el cual, al pagar ciertos bienes/servicios, **retienes un porcentaje** y lo
  depositas en una **cuenta del proveedor en el Banco de la Nación**, en vez de pagárselo
  completo. Ese dinero solo sirve para que el proveedor pague sus tributos.
- **Se aplica cuando la operación supera S/ 700** (umbral vigente; revisa el anexo vigente).
- Tasas por anexo (referencia): construcción/remodelación **4%**; movimiento de carga y
  comisión mercantil **10%**; demás servicios gravados e intermediación laboral **12%**.
- Cómo se paga: generas un **NPD (Número de Pago de Detracciones)** en SUNAT Operaciones en
  Línea y depositas en la cuenta BN del proveedor; el **saldo** se lo pagas al proveedor.
- Si el proveedor no tiene cuenta de detracciones, se comunica a SUNAT y el BN abre una de
  oficio.
- En tesorería: al pagar a un proveedor sujeto a SPOT, la salida real se divide en dos
  (detracción al BN + saldo al proveedor). Ambas deben quedar registradas para conciliar.

## Bancos comunes y cómo leer su extracto

| Banco | Formato típico de extracto | A tener en cuenta |
|---|---|---|
| **BCP** | Estados de cuenta detallados (web/app y PDF) | Comisiones de mantenimiento y transferencias interbancarias; ITF en cada movimiento |
| **BBVA** | Extracto con glosa clara del origen del movimiento | Distingue "cargo" (salida) de "abono" (entrada) |
| **Interbank** | Extracto con fecha de proceso vs. fecha de valor | Ojo: la fecha de valor puede diferir de la fecha real de la operación |
| **Scotiabank** | Extracto por producto (cuenta corriente/ahorro) | Comisiones por operaciones excedentes del paquete |
| **Banco de la Nación** | Extracto de cuentas de detracciones y cuentas propias | Cuenta de detracciones solo para pago de tributos; ITF no aplica a ciertos depósitos de detracción (verificar con SUNAT) |

Regla práctica: **no importa el formato del banco**; siempre ubica (a) saldo inicial, (b) cada
movimiento con su monto y signo, (c) saldo final. Eso es lo único que necesitas para conciliar.

## Causas comunes de diferencias

- Depósitos del último día del mes que el banco abonó al día siguiente.
- Cheques/transferencias emitidas que el beneficiario aún no cobra.
- **ITF y comisiones** debitadas por el banco que no anotaste.
- Detracciones debitadas de tu cuenta que registraste como pago completo al proveedor.
- Cheque devuelto/protestado (depositado y luego revertido).
- Movimiento registrado dos veces o con monto equivocado.

## Recomendaciones

- Conciliar **todas** las cuentas bancarias, cada mes, sin excepción.
- Guarda extracto + conciliación firmada juntos (respaldo y auditoría).
- Investiga toda partida que dure **más de 60–90 días** sin resolver (cheque sin cobrar,
  depósito sin aparecer).
- Registra ITF y comisiones apenas los veas en el extracto, no "al final del mes".
- Separa claramente la detracción del pago neto al proveedor para no duplicar ni omitir.

## Fuentes

- SUNAT — ITF (tasa 0.005%): gob.pe, "Impuesto a las Transacciones Financieras - ITF".
- SUNAT — Sistema de detracciones SPOT: orientacion.sunat.gob.pe (umbral S/ 700, tasas por anexo).
- Manuales de conciliación: partidas en tránsito, cheques girados y no cobrados, notas
  débito/crédito, y formato "saldo según banco ± partidas = saldo según libros".
