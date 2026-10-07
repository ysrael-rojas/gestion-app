# SPEC 24 — Rediseño del modal de detalle de comprobantes: banda de montos y pestañas

> **Status:** Implementado
> **Depends on:** SPEC 14, SPEC 23
> **Date:** 2026-10-07
> **Objective:** Al pulsar "Ver" en ventas y compras, el modal de detalle muestra arriba una banda con Total del comprobante, Monto abonado y Saldo por pagar, y organiza el resto en dos pestañas con Tabs ("Datos del comprobante" e "Historial de pagos"); el botón de acción del historial pasa a solo icono con Tooltip.

## Why this spec exists

El modal de detalle (SPEC 07/08, historial de SPEC 14) apila tres cards: "Datos del comprobante", "Montos" y el historial de pagos. El dato que más interesa al abrir un comprobante (cuánto queda por pagar) requiere leer dos cards y hacer cuentas. Este spec reorganiza la información: los montos clave como banda superior de lectura inmediata y el resto agrupado en pestañas, reduciendo el scroll y aclarando la jerarquía. Además normaliza el botón de acción del historial (hoy es `outline sm` con icono + texto) al patrón icono + Tooltip que ya usan los listados.

## Scope

**In:**

- Nueva banda de montos al inicio del `DialogContent` de ambos modales (`sale-detail-modal.tsx` y `purchase-detail-modal.tsx`), con tres valores:
  - **Total del comprobante** → `sale.total` / `purchase.total`, destacado.
  - **Monto abonado** → `sale.paidAmount` / `purchase.paidAmount`.
  - **Saldo por pagar** → `sale.balance` / `purchase.balance`.
  - Color semántico en abonado (verde) y saldo (ámbar si `> 0`, verde/muted si `= 0`). Diseño libre con shadcn/ui + Tailwind, sin colores hardcodeados fuera de los tokens semánticos de Tailwind (emerald/amber) — decisión recogida abajo.
- La banda se implementa como componente compartido `components/comprobantes/voucher-amounts-band.tsx`, usado por ambos modales.
- Reorganización en `Tabs` (shadcn/ui) con dos pestañas, mismas etiquetas y orden en ambos modales:
  1. **"Datos del comprobante"** — todos los `DetailField` actuales del card "Datos del comprobante" (Fecha de emisión, Fecha de registro, Tipo de comprobante, Nro comprobante, Cliente/Proveedor, Condición, Días de crédito, Fecha de vencimiento, Estado).
  2. **"Historial de pagos"** — el contenido de `PaymentHistorySection`.
- Pestaña activa por defecto: la primera ("Datos del comprobante").
- **El card "Montos" (Subtotal, IGV 18 %, Total) se elimina** de ambos modales: Subtotal e IGV dejan de mostrarse en el detalle (el total queda en la banda superior).
- En `components/comprobantes/payment-history-section.tsx` (consumido solo por estos dos modales), el botón "Imprimir recibo" pasa a **solo icono** (`Printer`, `size="icon-sm"`) con Tooltip visible **"Imprimir recibo"**, manteniendo `onPrint(entry.paymentId)` y su `sr-only`.
- El `DialogFooter`/`CardFooter` del modal queda igual: "Registrar pago" (solo PENDIENTE, enlaza a `/pagos/ingresos` o `/pagos/egresos` con los query params actuales) y "Cerrar".
- No se cambia la lógica de datos: `paidAmount` y `balance` ya llegan en `Sale`/`Purchase` desde los loaders; sin cambios en DB, schemas ni providers.

**Out of scope (for future specs):**

- Agregar Pagado/Saldo como `DetailField` en la pestaña de datos (la banda superior los cubre).
- Acción real para el botón Imprimir del listado (SPEC 23 lo dejó sin acción).
- Edición o recálculo de montos, nuevos estados de pago, o pagos dentro del modal.
- Cambiar el botón "Registrar pago" del footer o del listado.
- Exportar el historial de pagos (CSV/PDF).
- Reutilizar `PaymentHistorySection` en otras pantallas.

## Data model

Esta spec no crea tablas, migraciones ni tipos nuevos. Consume campos existentes de `Sale` (SPEC 07) y `Purchase` (SPEC 08): `total`, `paidAmount`, `balance`.

Nuevos archivos de UI:

| Archivo | Contenido |
| --- | --- |
| `components/ui/tabs.tsx` | Componente Tabs de shadcn/ui (instalado con `npx shadcn@latest add tabs`). |
| `components/comprobantes/voucher-amounts-band.tsx` | Componente compartido `VoucherAmountsBand({ total, paidAmount, balance })`: banda de 3 montos con formato `formatCurrency`. |

Banda de montos (diseño acordado):

- Contenedor: `Card` con `bg-muted/30`, `ring-0`, grid de 3 columnas separadas por `Separator` vertical en `sm+` (apiladas en móvil).
- Cada celda: label en `text-xs uppercase text-muted-foreground` + valor en `text-base sm:text-lg font-semibold tabular-nums`.
- Jerarquía y color:
  - `Total del comprobante`: valor destacado (el mayor peso visual de la banda).
  - `Monto abonado`: `text-emerald-600 dark:text-emerald-400`.
  - `Saldo por pagar`: `balance > 0` → `text-amber-600 dark:text-amber-400`; `balance === 0` → `text-emerald-600 dark:text-emerald-400` (comprobante saldado).

## Implementation plan

1. Instalar Tabs: `npx shadcn@latest add tabs` (no correr `init`; `components.json` ya existe). Confirmar que queda `components/ui/tabs.tsx`. `npm run lint`.
2. `components/comprobantes/voucher-amounts-band.tsx` (nuevo): crear `VoucherAmountsBand` según el diseño de Data model, importando `Card`, `Separator` (ya existe en `components/ui/`) y `formatCurrency` de `@/lib/utils`. `npm run lint`.
3. `components/comprobantes/payment-history-section.tsx`: envolver el botón de imprimir con `Tooltip`/`TooltipTrigger`/`TooltipContent` (y `TooltipProvider` a nivel de la sección), cambiando a `Button variant="outline" size="icon-sm"` con `<Printer />` + `<span className="sr-only">Imprimir recibo</span>` y tooltip "Imprimir recibo". El `onClick={onPrint(entry.paymentId)}` no cambia. `npm run lint`.
4. `components/ventas/sale-detail-modal.tsx`:
   - Insertar `<VoucherAmountsBand total={sale.total} paidAmount={sale.paidAmount} balance={sale.balance} />` como primer elemento del `CardContent`.
   - Eliminar el card "Montos" completo.
   - Envolver "Datos del comprobante" e historial en `Tabs defaultValue="datos"` con `TabsList` de dos `TabsTrigger`: `Datos del comprobante` (value `datos`) e `Historial de pagos` (value `pagos`).
   - `TabsContent value="datos"`: el grid de `DetailField` actual (sin cambios de campos).
   - `TabsContent value="pagos"`: `<PaymentHistorySection comprobanteId={sale.id} direction="INGRESO" onPrint={setPrintingPaymentId} />`.
   - Footer sin cambios. `npm run lint`.
5. `components/compras/purchase-detail-modal.tsx`: mismos cambios que el paso 4 con `purchase.total/paidAmount/balance`, `direction="EGRESO"` y el grid con `Proveedor`. `npm run lint`.
6. Verificación manual con `npm run dev` (login con credenciales de `.env`):
   - `/ventas/listado` → "Ver" en una fila: banda de 3 montos con colores correctos (saldo ámbar si debe, verde/muted si `= 0`); pestañas "Datos del comprobante" e "Historial de pagos"; la primera activa por defecto; el card "Montos" ya no existe.
   - Hover sobre el botón del historial: solo icono + tooltip "Imprimir recibo"; el click sigue abriendo el recibo.
   - `/compras/listado` → "Ver" (si hay filas; si no hay datos, verificar al menos que el modal renderiza con montos en 0.00): ídem con encabezado "Proveedor".
   - Comprobar que "Registrar pago" y "Cerrar" del footer siguen funcionando.
7. Cerrar con `npm run lint`, `npm test` y `npm run build` en verde.

## Acceptance criteria

- [x] Al abrir el detalle de una venta o compra, lo primero visible del contenido es la banda con `Total del comprobante`, `Monto abonado` y `Saldo por pagar`, con los valores de `total`, `paidAmount` y `balance` formateados con `formatCurrency`.
- [x] `Monto abonado` se muestra en verde y `Saldo por pagar` en ámbar cuando `balance > 0` y en verde cuando `balance === 0`.
- [x] La banda vive en un componente compartido (`voucher-amounts-band.tsx`) usado por ambos modales.
- [x] El modal tiene dos pestañas con las etiquetas exactas `Datos del comprobante` e `Historial de pagos`, y la pestaña activa por defecto es la primera.
- [x] En la pestaña "Datos del comprobante" aparecen los 9 `DetailField` actuales (Fecha de emisión, Fecha de registro, Tipo de comprobante, Nro comprobante, Cliente/Proveedor, Condición, Días de crédito, Fecha de vencimiento, Estado).
- [x] El card "Montos" (Subtotal, IGV 18 %, Total) ya no existe en ningún modal de detalle.
- [x] En la pestaña "Historial de pagos" se ve el historial con sus columnas actuales y datos cargados.
- [x] El botón de acción del historial es solo icono (`Printer`), con tooltip visible "Imprimir recibo", y sigue imprimiendo el recibo correspondiente.
- [x] El footer del modal sigue mostrando "Registrar pago" (solo PENDIENTE) con el link a `/pagos/ingresos` o `/pagos/egresos` y "Cerrar".
- [x] `components/ui/tabs.tsx` existe (instalado vía shadcn) y no se corrió `shadcn init`.
- [x] `npm run lint`, `npm test` y `npm run build` pasan.

## Decisions

- **Sí:** diseño libre para la banda ("sorpréndeme"): jerarquía con total destacado, labels en mayúsculas pequeñas y color semántico verde/ámbar. Los verdes/ámbar usan las escalas de Tailwind (`emerald`/`amber`) con variante dark; no se agregan tokens nuevos a `globals.css`.
- **Sí:** componente compartido `VoucherAmountsBand` para no duplicar la banda en los dos modales.
- **Sí:** eliminar el card "Montos": Subtotal e IGV desaparecen del detalle (decisión del usuario). El total queda en la banda; si más adelante se quiere ver el desglose de IGV, será otra spec.
- **Sí:** etiquetas de pestaña fijas: "Datos del comprobante" / "Historial de pagos"; primera activa por defecto.
- **Sí:** instalar `tabs` de shadcn (confirmado por el usuario); no se vuelve a correr `init`.
- **Sí:** botón del historial solo icono con Tooltip visible "Imprimir recibo" (mismo patrón que los listados), conservando el `sr-only` y el comportamiento de impresión.
- **Sí:** `PaymentHistorySection` conserva su Card con título "Historial de pagos" dentro de la pestaña (cambio mínimo al componente compartido; solo estos dos modales lo consumen).
- **No:** tocar loaders, tipos, schemas, DB ni la lógica de pagos: `paidAmount`/`balance` ya existen en `Sale`/`Purchase`.
- **No:** cambiar el footer del modal (Registrar pago / Cerrar) ni los botones del listado.

## Risks

| Riesgo | Mitigación |
| --- | --- |
| `paidAmount`/`balance` podrían no estar disponibles en algún flujo (p. ej. comprobante recién creado) | Los loaders de `lib/comprobantes/` ya devuelven ambos campos con default 0 (`balance = total` si no hay pagos); verificar en dev con un comprobante sin pagos. |
| Tooltip dentro de Dialog puede quedar debajo del overlay o cerrar el dialog | shadcn ya usa Radix en ambos; probar en dev y, si el portal del Tooltip interfiere, envolver con `TooltipProvider` dentro del `DialogContent`. |
| Quitar el card "Montos" borra Subtotal/IGV que nadie más muestra | Decisión explícita del usuario; queda documentado aquí y en el criterio correspondiente. |
| El `Card` del historial dentro de `TabsContent` duplica visualmente el título de la pestaña | Aceptado (cambio mínimo); si molesta visualmente, ajuste cosmético en otra iteración. |
| Instalar `tabs` puede traer dependencias nuevas a `package.json` | Revisar el diff de `package.json`/`components/ui/tabs.tsx` tras instalar; `npm run build` lo valida. |
