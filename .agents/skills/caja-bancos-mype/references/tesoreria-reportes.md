# Reportes de tesorería y dashboard de finanzas

## Concepto

La tesorería responde una sola pregunta para el dueño: **¿cuánto dinero tengo, de dónde viene
y hacia dónde va?** Los reportes de tesorería convierten los movimientos de caja y bancos en
información para decidir (¿puedo pagar proveedores?, ¿me alcanza el mes?, ¿qué me debo cobrar?).

Todo reporte de tesorería se expresa en **soles (S/)** y, si hay cuentas en dólares, se
convierte con el tipo de cambio del período (separando siempre PEN de USD).

## Reportes esenciales

### 1. Posición de efectivo (diaria)

Qué dice: **cuánto tienes disponible hoy y dónde** (caja, cada cuenta bancaria).

```
POSICIÓN DE EFECTIVO — Fecha: ____/____/____
Concepto                        Moneda      Monto (S/)
Caja principal                  PEN         __________
Caja chica (fondo fijo)         PEN         __________
Banco BCP cta. corriente        PEN         __________
Banco BBVA cta. ahorro          PEN         __________
Banco BCP cta. USD              USD         __________ (equiv. S/ ____)
---------------------------------------------------------------
TOTAL DISPONIBLE                            S/ __________
```

Se calcula: saldo inicial + ingresos del período − egresos del período = saldo actual.

### 2. Flujo de caja proyectado (semanal/mensual)

Qué dice: **lo que entrará y saldrá** en las próximas semanas, para anticipar faltantes.

```
FLUJO DE CAJA PROYECTADO — Semana del __ al __
Concepto                        Sem 1    Sem 2    Sem 3    Sem 4
Saldo inicial                   ______   ______   ______   ______
(+) Cobranzas de ventas         ______   ______   ______   ______
(+) Otros ingresos              ______   ______   ______   ______
(-) Pago a proveedores          ______   ______   ______   ______
(-) Planilla / sueldos          ______   ______   ______   ______
(-) Tributos (IGV, renta)       ______   ______   ______   ______
(-) Otros egresos               ______   ______   ______   ______
= Saldo final proyectado        ______   ______   ______   ______
```

Si un saldo final proyectado queda **negativo**, hay un problema de liquidez por anticipar.

### 3. Aging de cobros / cartera (cuentas por cobrar)

Qué dice: **cuánto te deben y desde cuándo** (clientes con deuda).

| Cliente | Total | Por vencer | 1–30 días | 31–60 días | +60 días |
|---|---|---|---|---|---|
| ... | S/ __ | S/ __ | S/ __ | S/ __ | S/ __ |

Regla práctica: mientras más vieja la deuda, más difícil cobrarla. Prioriza cobrar lo de
+30 días.

### 4. Resumen de ingresos y egresos (por período)

Qué dice: **de dónde vino y a dónde fue** el dinero en un período.

```
RESUMEN DE MOVIMIENTOS — Mes de __________
INGRESOS                          S/ __________
  Cobranza de ventas              S/ __________
  Anticipos de clientes           S/ __________
  Otros ingresos                  S/ __________
EGRESOS                           S/ __________
  Pago a proveedores              S/ __________
  Planilla                        S/ __________
  Gastos operativos               S/ __________
  Tributos                        S/ __________
  Retiros del propietario         S/ __________
RESULTADO NETO DEL PERÍODO        S/ __________
```

### 5. Reporte de caja chica

Qué dice: en qué se gastó el fondo fijo (ver `caja-chica.md`): fondo inicial, gastado por
concepto, reposiciones y saldo.

## Dashboard de finanzas (indicadores para el dueño)

| Indicador | Qué mide | Cómo se calcula |
|---|---|---|
| Efectivo disponible | Liquidez inmediata | Suma de cajas + bancos |
| % en caja vs. banco | Cuánto efectivo sin depositar | (Caja / Total disponible) × 100 |
| Saldo por cuenta | Dónde está el dinero | Posición por cuenta |
| Días de caja | Cuánto te dura el efectivo | Disponible / gasto diario promedio |
| Ingresos vs. egresos | Si el mes fue positivo | Resultado neto del período |
| Cartera vencida | Deuda de clientes atrasada | Suma de montos con +30 días |
| Días de cobro (DSO) | Cuánto tardas en cobrar | (Cartera / ventas a crédito) × días |

Un dashboard útil para una MYPE muestra **5 números**: efectivo disponible, resultado del mes,
cartera por cobrar, deuda a proveedores y próximos pagos de tributos.

## Recomendaciones

- La **posición de efectivo se mira a diario**; el flujo de caja, **semanal**; el resto, mensual.
- Automatiza lo repetitivo (reportes que salen solos del sistema) y revisa solo lo que varía.
- Separa siempre **PEN de USD** y usa el tipo de cambio del día para el equivalente.
- El flujo de caja proyectado es el reporte que **más evita sorpresas**: actualízalo cada semana.
- Un dashboard sirve si es **corto y accionable**: menos gráficos, más decisiones.

## Fuentes

- Prácticas de tesorería y gestión de liquidez (posición de efectivo, flujo de caja, DSO).
- Guías de control de indicadores clave (COSO 2013 — actividades de control / KPIs).
