# SPEC 25 — Registro de pagos desde el listado con drawers anidados

> **Status:** Aprobado
> **Depends on:** SPEC 07, SPEC 08, SPEC 09, SPEC 13, SPEC 17, SPEC 24
> **Date:** 2026-10-07
> **Objective:** Al pulsar "Registrar pago" en el datatable de ventas o compras se abren 4 drawers anidados (uno por paso) que registran el pago en la BD sin salir del listado, y el footer del modal de detalle pierde ese botón.

## Why this spec exists

Hoy el botón de saldo pendiente (`Wallet`) de los datatables de ventas/compras es un `<Link>` a `/pagos/ingresos` o `/pagos/egresos` con query params; esa página auto-abre el `PaymentModal` (un formulario único de una sola pantalla). El usuario describe el flujo como "modal + redirección al panel de pagos" y quiere un registro dirigido: 4 pasos cortos en drawers apilados, con el comprobante ya contextualizado y el importe precargado con el saldo. Además, el footer del modal de detalle duplica ese botón; se quita porque el registro pasa a vivir en el listado.

## Scope

**In:**

- Instalar el componente `drawer` de shadcn (`npx shadcn@latest add drawer`, agrega `vaul` como dependencia). No se corre `init`.
- Nuevo componente compartido `components/comprobantes/nested-payment-drawers.tsx` con los 4 drawers anidados (uno por paso, apilados con vaul) y un único estado de formulario compartido entre pasos.
- **Panel 1 (drawer base):**
  - Bandera con el tipo de documento (`sale.voucherType` / `purchase.voucherType`) + número de comprobante destacado (`voucherNumber`), más contexto real de la fila: condición y fecha de vencimiento (diseño libre: mostrar los datos reales disponibles de la fila, sin inventar campos).
  - Campo Cliente/Proveedor: input deshabilitado, readonly, con el nombre ya resuelto de la fila (`clientName` / `providerName`); no se puede cambiar.
  - Campo Fecha de pago: input date, default hoy (`getTodayLocalDate()`).
  - Botones: **"Continuar"** (avanza) y **"Cancelar"** (cierra todos los drawers y descarta todo).
- **Panel 2 (drawer anidado sobre el 1):**
  - Método: `Select` con placeholder que dice "Seleccionar" (sin precargar la primera opción).

    Al elegir método se filtran las cuentas: efectivo → solo `CASH_BOX`; cualquier otro → solo `BANK_ACCOUNT` (misma regla de `payment-form.tsx`).

    Si el método cambia a uno de tipo distinto y la cuenta elegida ya no aplica, se limpia `cashAccountId`.

  - Caja/Banco: `Select` con placeholder "Seleccionar"; lista filtrada por el método (cuentas activas de `useCajasBancos()`).
  - Categoría: `Select` deshabilitado, precargada: "Cobranza de venta" si es venta (INGRESO) / "Pago a proveedor" si es compra (EGRESO); no puede cambiarse.
  - Botones: **"Continuar"** (avanza) y **"Atrás"** (cierra este drawer, vuelve al panel 1 conservando datos).
- **Panel 3 (drawer anidado sobre el 2):**
  - Banda de montos reutilizando el diseño de `VoucherAmountsBand` (SPEC 24): **Total del comprobante**, **Monto abonado** y **Saldo pendiente por pagar**, con `total`, `paidAmount` y `balance` de la fila; saldo en ámbar si `> 0`.
  - Campo **"Importe"**: number, precargado con el saldo pendiente, editable.
  - Indicador en vivo del **nuevo saldo** (`balance - importe`) que se recalcula al escribir, con color semántico (verde si `= 0`, ámbar si `> 0`).
  - Botones: **"Continuar"** (avanza) y **"Atrás"** (vuelve al panel 2 conservando datos).
- **Panel 4 (drawer anidado sobre el 3):**
  - Referencia (opcional, max 60, placeholder "Nro de operación / autorización").
  - Notas (opcional, max 200).
  - Botones: **"Registrar pago"** (submit; registra en la BD) y **"Atrás"** (vuelve al panel 3 conservando datos).
- **Registro en BD:** "Registrar pago" llama a `addPayment(values)` del `PagosProvider` (que usa la RPC transaccional `createPayment`/`create_payment_with_allocations` de SPEC 17) con `allocations = [{ comprobanteId, amount: importe }]` (todo el importe va al comprobante de la fila).
- **Post-registro:** cierra los 4 drawers, `toast.success("Pago registrado")` y `refresh()` del provider de dominio (`ventas-provider` / `compras-provider`) para que las columnas Pagado/Saldo y el badge de estado se actualicen sin recargar la página.
- **Botón del datatable:** en `sales-columns.tsx` y `purchases-columns.tsx`, el botón de saldo pendiente pasa de `<Link>` a `<Button onClick>` que abre el flujo (mismo ícono `Wallet` y tooltip "Registrar pago", solo en filas PENDIENTE).
- **Footer del detalle:** quitar el botón "Registrar pago" de `sale-detail-modal.tsx` y `purchase-detail-modal.tsx`; el footer queda solo con "Cerrar".

**Out of scope (for future specs):**

- La pantalla `/pagos/ingresos` y `/pagos/egresos` y el `PaymentModal`: quedan exactamente igual (siguen siendo el flujo para anticipos y pagos multi-comprobante).
- El flujo del botón "Registrar pago" del page header de /pagos (`payments-view.tsx`).
- Asignar un pago a varios comprobantes (el drawer es 1 pago → 1 comprobante).
- Impresión o vista del recibo después de registrar.
- Editar o anular pagos desde el drawer.
- Cambios en la DB, RPC, schemas del backend o providers.

## Data model

Esta spec no crea tablas, migraciones ni tipos nuevos. Consume `Sale`/`Purchase` (SPEC 07/08: `voucherType`, `voucherNumber`, `entityId`, `total`, `paidAmount`, `balance`) y los catálogos existentes de caja (`listPaymentMethods`, `listCategories`, cuentas de `useCajasBancos`, siembra perezosa `ensureDefaultSettings`/`ensureCatalogsSeeded` de `lib/caja/caja.ts`).

Estado compartido del wizard (en el nuevo componente, se conserva al ir y volver con "Atrás"):

```ts
interface PaymentWizardState {
  entityId: string;          // viene de la fila, fijo
  comprobanteId: string;     // viene de la fila, fijo
  direction: "INGRESO" | "EGRESO";
  paymentDate: string;       // default getTodayLocalDate()
  methodId: string;          // "" hasta que se elija
  cashAccountId: string;     // "" hasta que se elija
  categoryId: string;        // fijado por dirección, deshabilitado
  amount: string;            // precargado con balance de la fila
  reference: string;
  notes: string;
}
```

Del panel 3 en adelante, `amount` valida `number().positive()` y `<= balance`.

Al presionar "Registrar pago" se arma el payload del schema existente (`PaymentFormValues` de `lib/schemas/payment.ts`) y se llama a `addPayment` del `PagosProvider` (no se crean endpoints ni RPC nuevos):

```ts
await addPayment({
  entityId, direction, paymentDate, amount: Number(amount),
  methodId, cashAccountId, categoryId,
  reference: reference || undefined, notes: notes || undefined,
  allocations: [{ comprobanteId, amount: Number(amount) }],
});
```

## Implementation plan

1. Instalar el drawer: `npx shadcn@latest add drawer`. Confirmar `components/ui/drawer.tsx` y la dependencia `vaul` en `package.json`. `npm run lint`.
2. Crear `components/comprobantes/nested-payment-drawers.tsx` con las Props (`open`, `onOpenChange`, `direction`, `entityName`, `voucherType`, `voucherNumber`, `issueDate`, `condition`, `dueDate`, `total`, `paidAmount`, `balance`, `entityId`, `comprobanteId`, `onRegistered`) y el estado compartido `PaymentWizardState`, reset al abrir. Los 4 `Drawer` definidos pero con contenido placeholder (solo título) y la navegación: "Continuar" abre el siguiente drawer anidado, "Atrás" cierra el drawer actual, "Cancelar" llama `onOpenChange(false)`. Cierre por swipe/overlay de cualquier drawer también cierra los de encima. `npm run lint`.
3. Contenido del panel 1: header con badge/estilo para tipo + número, contexto de condición/vencimiento, Cliente/Proveedor readonly (Input disabled con nombre resuelto) y fecha de pago con default hoy. `npm run lint`.
4. Contenido del panel 2: loaders de catálogos reutilizando `listPaymentMethods` + `listCategories(direction)` + siembra perezosa (copiar el patrón de `payment-form.tsx:174-202`), cuentas desde `useCajasBancos()`; selects de Método y Caja/Banco con placeholder "Seleccionar", la regla de filtrado por tipo de cuenta y el reset de cuenta al cambiar método; Categoría deshabilitada precargada con el id de la categoría cuyo nombre coincida con "Cobranza de venta" / "Pago a proveedor" (fallback: primera categoría de la dirección). `npm run lint`.
5. Contenido del panel 3: banda de 3 montos siguiendo el diseño de `voucher-amounts-band.tsx`, campo Importe precargado con `balance` y el indicador del nuevo saldo en vivo derivado de `Math.max(balance - Number(amount), 0)` con color verde si `= 0`, ámbar si `> 0`. `npm run lint`.
6. Contenido del panel 4: Referencia y Notas (maxlengths del schema), botón "Registrar pago" deshabilitado mientras envía (`isLoading`); en el submit arma el payload del data model, llama `addPayment`, y en éxito: `toast.success("Pago registrado")`, cierre completo y `onRegistered()`. Captura el error con el `mapError` estándar (toast error y los drawers quedan abiertos en el panel 4). `npm run lint`.
7. Validación por panel al presionar "Continuar": panel 1 requiere fecha; panel 2 requiere método y caja (mensajes accionables en `role="alert"`); panel 3 requiere importe `> 0` y `<= balance` (mismo límite que el RPC de SPEC 17: "El importe supera el saldo del comprobante"). Bloquea abrir panel 3 sin método/caja. `npm run lint`.
8. Wire en ventas: `sales-columns.tsx` cambia el `<Link>` por `<Button onClick={() => onRegisterPayment(row)}>` (ícono y tooltip iguales), nueva prop `onRegisterPayment` en el columnHelper y en el data table; `ventas-listado-view.tsx` instancia `NestedPaymentDrawers` con la fila elegida y `onRegistered={refresh}` (`refresh` del `useVentas`). `npm run lint`.
9. Wire en compras: idéntico en `purchases-columns.tsx` / `compras-listado-view.tsx` con `direction="EGRESO"` y `providerName`. `npm run lint`.
10. Quitar el botón "Registrar pago" (y su import/formateo innecesario) del footer de `sale-detail-modal.tsx` y `purchase-detail-modal.tsx`; el footer queda solo con "Cerrar". `npm run lint`.
11. Verificación manual con `npm run dev` (login con credenciales de `.env`), caminando los 4 pasos con una venta PENDIENTE y una compra PENDIENTE; comprobar el caso de error (importe mayor al saldo, sin método) y el caso feliz hasta ver el saldo actualizado en la fila. Validación global: `npm run lint` + `npm test` + `npm run build` en verde.

## Acceptance criteria

- [ ] En `/ventas/listado`, el botón de saldo pendiente (`Wallet`) del datatable **ya no redirige a /pagos**; abre el panel 1 del drawer.
- [ ] En `/compras/listado`, ídem, con datos de la compra (proveedor, tipo y número de comprobante).
- [ ] El panel 1 muestra tipo de documento + número de comprobante con estilo, el nombre del cliente/proveedor en input deshabilitado con el valor real de la fila, y fecha de pago prefilled con hoy.
- [ ] Los botones del panel 1 se llaman exactamente "Continuar" y "Cancelar".
- [ ] "Cancelar" cierra todos los drawers y descarta todo; reabrir el flujo con otra fila arranca limpia (estado reseteado y prefill correcto).
- [ ] "Continuar" del panel 1 abre un drawer anidado sobre el 1 (vaul), y no lo cierra.
- [ ] El panel 2 muestra Método y Caja/Banco con placeholder "Seleccionar" (sin precarga de primera opción) y Categoría deshabilitada con "Cobranza de venta" (venta) o "Pago a proveedor" (compra).
- [ ] Si el método elegido es efectivo, la lista de Caja/Banco muestra solo cuentas `CASH_BOX`; para cualquier otro método, solo `BANK_ACCOUNT`.
- [ ] "Continuar" del panel 2 no avanza si falta método o cuenta; muestra el error en el panel.
- [ ] El panel 3 muestra Total del comprobante, Monto abonado y Saldo pendiente por pagar con los valores de la fila, y debajo el campo Importe precargado con el saldo pendiente.
- [ ] Al editar el Importe, el nuevo saldo se recalcula en vivo y se distingue con color (verde si `= 0`, ámbar si `> 0`).
- [ ] "Continuar" del panel 3 rechaza un importe `<= 0` o mayor al saldo, con mensaje claro.
- [ ] "Atrás" de los paneles 2, 3 y 4 cierra ese drawer y conserva los valores ya llenados.
- [ ] El panel 4: campos Referencia y Notas quedan vacíos; ninguno es obligatorio para registrar el pago.
- [ ] Al presionar "Registrar pago" se inserta el pago en la BD: aparece en `/pagos` (con su recibo), y las columnas Pagado/Saldo (y el badge PENDIENTE/PAGADO) de la fila en el listado se actualizan sin recargar la página.
- [ ] Si la BD rechaza (doble submit, saldo cambiado), se muestra `toast.error` con mensaje comprensible y no se insertan datos duplicados.
- [ ] Después de un registro exitoso se cierran los 4 drawers y se muestra `toast.success("Pago registrado")`.
- [ ] El footer de los modales de detalle de venta y compra ya **no** tiene el botón "Registrar pago"; solo queda "Cerrar".
- [ ] La pantalla `/pagos/ingresos` y `/pagos/egresos` (con su `PaymentModal` completo) sigue funcionando intacta, y el botón "Registrar pago" de su header no cambia.
- [ ] `components/ui/drawer.tsx` existe (instalado vía shadcn con `vaul`) y no se corrió `shadcn init`.
- [ ] `npm run lint`, `npm test` y `npm run build` pasan.

## Decisions

- **Sí:** drawers anidados de vaul, uno por paso apilados — elección explícita del usuario en la fase de aclaración; cada "Continuar" apila un drawer y cada "Atrás" cierra el de arriba (los datos del estado compartido se conservan).
- **Sí:** instalar `drawer` de shadcn (`vaul`): no había ningún componente de drawer en `components/ui/`, y vaul es el estándar del repo (shadcn 4.x) para apilamiento con soporte de drawers anidados.
- **Sí:** solo el botón del datatable abre el nuevo flujo; el botón "Registrar pago" del footer del modal de detalle **se elimina** (verbalizado por el usuario: "del modal se debe quitar ese botón").
- **Sí:** post-registro cerrar + toast + `refresh()` del provider: el listado se refresca por provider (misma vía que addPayment en /pagos), sin navegar ni abrir el recibo (decisión del usuario).
- **Sí:** sin auto-seed de Método/Caja (contrasta con `payment-form.tsx`, que precarga la primera opción): el usuario pidió explícitamente "Seleccionar" como estado inicial.
- **Sí:** Categoría deshabilitada y prefijada por dirección, mapeada por nombre exacto del catálogo sembrado ("Cobranza de venta" / "Pago a proveedor"); fallback a la primera categoría de la dirección si la siembra no la trae (siempre debería estar; ver riesgos).
- **Sí:** cargar catálogos con el patrón existente de `payment-form.tsx` (siembra perezosa + `listPaymentMethods` + `listCategories`) en vez de duplicar loaders.
- **Sí:** reutilizar `addPayment`/`createPayment` y la RPC transaccional de SPEC 17; un solo comprobante por pago en `allocations` — el drawer no crea endpoints ni RPC nuevos.
- **Sí:** máx importe = saldo pendiente, validado en UI **y** respaldado por la regla del RPC; límites alineados con SPEC 17.
- **No:** reutilizar `PaymentForm` para el wizard: es un formulario único de una pantalla con auto-seed y validación al final; el wizard requiere validación por panel, campos precargados distintos y estado entre pasos. Compartir el payload (`PaymentFormValues`) y los loaders, no el componente.

## Risks

| Riesgo | Mitigación |
| --- | --- |
| Drawers anidados de vaul pueden renderizarse como bottom-sheet pequeña en pantallas de escritorio y verse frágiles | Ajustar clases (`sm:max-h`, `side`, etc.) tras instalar; el paso 2 incluye probar la pila en desktop con dev server antes de seguir. |
| La categoría por nombre puede no existir si la siembra perezosa falla (DB vacía o usuarios la renombraron) | Fallback a la primera categoría de la dirección; `ensureCatalogsSeeded` corre igual que en `payment-form.tsx` (SPEC 09). |
| Doble click en "Registrar pago" = dos pagos | El botón se deshabilita mientras `addPayment` está en curso (`isLoading`). |
| El saldo puede haber cambiado entre abrir el drawer y enviar (otro pago concurrente) | El RPC de SPEC 17 ya valida "asignación supera el saldo" dentro de la transacción; se captura con `mapError` y toast, sin datos duplicados. |
| El cierre por swipe/overlay de un drawer del medio deja abiertos los de arriba en estado inconsistente | Regla implementada en el paso 2: cerrar el drawer N también cierra N+1..4 (y el estado del wizard se conserva para volver a avanzar). |
| Cambiar de fila mientras el drawer está abierto (foco, routing) | El drawer se desmonta con la fila seleccionada en state de la vista; el botón vuelve a abrir con la fila nueva y reset del estado. |

## What is **not** in this spec

- El `PaymentModal` de /pagos y su formulario completo (sigue igual).
- Pagos multi-comprobante / asignación manual.
- Impresión de recibo tras registrar.
- Anulación o edición de pagos desde el drawer.
- Cambios de esquema en la DB, RPC, schemas backend o providers.

Cada uno de esos, si aterriza, va en su propia spec.
