# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: registrar-pago-y-ver-saldo.spec.ts >> registrar pago y ver saldo >> flujo completo: ver → registrar pago → ver saldo actualizado → ver historial
- Location: tests\e2e\registrar-pago-y-ver-saldo.spec.ts:30:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText('F001-000001')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" getByText('F001-000001') with timeout 5000ms
  - waiting for getByText('F001-000001')

```

```yaml
- region "Notifications alt+T"
- dialog "Detalle de la venta":
  - heading "Detalle de la venta" [level=2]
  - paragraph: Información registrada del comprobante
  - text: Datos del comprobante Fecha de emisión 30/09/2026 Fecha de registro 30/09/2026 Tipo de comprobante Boleta Nro comprobante b-00067 Cliente HORTIFRUT SAC Condición Contado Días de crédito — Fecha de vencimiento — Estado Pendiente Montos Subtotal S/ 1,525.42 IGV 18 % S/ 274.58 Total S/ 1,800.00 Historial de pagos
  - paragraph: Aún no se han registrado pagos para este comprobante.
  - paragraph: Puedes registrar uno desde el botón Registrar pago de arriba.
  - button "Registrar pago"
  - button "Cerrar"
  - button "Close"
```

# Test source

```ts
  1  | import { expect, test } from "@playwright/test";
  2  | 
  3  | /**
  4  |  * E2E: registrar un pago parcial sobre una venta y verificar que el saldo
  5  |  * del comprobante y el historial de pagos se actualizan en la UI.
  6  |  *
  7  |  * Seed requerido (creado a mano en la DB de desarrollo antes de correr este test):
  8  |  *   - 1 entidad/cliente con RUC válido y nombre reconocible, p.ej.:
  9  |  *       { document_type: "RUC", document_number: "20512345678", name: "ACME S.A." }
  10 |  *   - 1 comprobante (voucher_kind = "VENTA") con saldo pendiente > 0 y entity_id = la entidad anterior.
  11 |  *     Total recomendado: 1000, paid_amount: 0, status: "PENDIENTE".
  12 |  *
  13 |  * Variables de entorno necesarias:
  14 |  *   - NEXT_PUBLIC_SUPABASE_URL
  15 |  *   - NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  16 |  *
  17 |  * Para correrlo localmente:
  18 |  *   1) Cargar el seed en Supabase (con `apply_migration` o insertando filas).
  19 |  *   2) Asegurar que `npm run dev` pueda arrancar (Next.js 16.3.6, Node 20+).
  20 |  *   3) `npm run test:e2e`
  21 |  *
  22 |  * Si el seed no existe, este test falla con un selector que no aparece; ese
  23 |  * es el comportamiento esperado y no es un bug del flujo.
  24 |  */
  25 | 
  26 | const SALE_NUMBER_FRAGMENT = "F001-000001"; // número del comprobante seed
  27 | const PAYMENT_AMOUNT = 250;
  28 | 
  29 | test.describe.serial("registrar pago y ver saldo", () => {
  30 |   test("flujo completo: ver → registrar pago → ver saldo actualizado → ver historial", async ({
  31 |     page,
  32 |   }) => {
  33 |     // 1. Ir al listado de ventas y abrir el comprobante de seed.
  34 |     await page.goto("/ventas/listado");
  35 | 
  36 |     const verBtn = page.getByRole("button", { name: "Ver" }).first();
  37 |     await expect(verBtn).toBeVisible({ timeout: 15_000 });
  38 |     await verBtn.click();
  39 | 
  40 |     // El modal muestra el número del comprobante de seed.
> 41 |     await expect(page.getByText(SALE_NUMBER_FRAGMENT)).toBeVisible();
     |                                                        ^ Error: expect(locator).toBeVisible() failed
  42 | 
  43 |     // 2. Click en "Registrar pago" → navega a /pagos/ingresos con comprobanteId.
  44 |     await page.getByRole("link", { name: "Registrar pago" }).first().click();
  45 | 
  46 |     await expect(page).toHaveURL(/\/pagos\/ingresos/);
  47 | 
  48 |     // 3. Abrir el formulario de pago y registrar uno parcial.
  49 |     await page.getByRole("button", { name: "Registrar pago" }).first().click();
  50 | 
  51 |     const amountInput = page.getByLabel(/importe/i);
  52 |     await expect(amountInput).toBeVisible();
  53 |     await amountInput.fill(String(PAYMENT_AMOUNT));
  54 | 
  55 |     await page.getByRole("button", { name: /guardar|registrar|confirmar/i }).click();
  56 | 
  57 |     // 4. Volver al listado y verificar que el saldo refleja el pago parcial.
  58 |     await page.goto("/ventas/listado");
  59 | 
  60 |     // El saldo debería ser 1000 - 250 = 750 (asume total=1000).
  61 |     await expect(page.getByText("750")).toBeVisible({ timeout: 10_000 });
  62 | 
  63 |     // 5. Reabrir el detalle y verificar que el historial muestra el pago recién creado.
  64 |     await page.getByRole("button", { name: "Ver" }).first().click();
  65 |     await expect(page.getByText("Historial de pagos")).toBeVisible();
  66 | 
  67 |     // La fila del pago aparece con su número de recibo (RI-YYYY-NNNNNN).
  68 |     await expect(page.locator("text=/RI-\\d{4}-\\d{6}/")).toBeVisible();
  69 |   });
  70 | });
  71 | 
```