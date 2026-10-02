import { expect, test } from "@playwright/test";

/**
 * E2E: registrar un pago parcial sobre una venta y verificar que el saldo
 * del comprobante y el historial de pagos se actualizan en la UI.
 *
 * Seed requerido (creado a mano en la DB de desarrollo antes de correr este test):
 *   - 1 entidad/cliente con RUC válido y nombre reconocible, p.ej.:
 *       { document_type: "RUC", document_number: "20512345678", name: "ACME S.A." }
 *   - 1 comprobante (voucher_kind = "VENTA") con saldo pendiente > 0 y entity_id = la entidad anterior.
 *     Total recomendado: 1000, paid_amount: 0, status: "PENDIENTE".
 *
 * Variables de entorno necesarias:
 *   - NEXT_PUBLIC_SUPABASE_URL
 *   - NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
 *
 * Para correrlo localmente:
 *   1) Cargar el seed en Supabase (con `apply_migration` o insertando filas).
 *   2) Asegurar que `npm run dev` pueda arrancar (Next.js 16.3.6, Node 20+).
 *   3) `npm run test:e2e`
 *
 * Si el seed no existe, este test falla con un selector que no aparece; ese
 * es el comportamiento esperado y no es un bug del flujo.
 */

const SALE_NUMBER_FRAGMENT = "F001-000001"; // número del comprobante seed
const PAYMENT_AMOUNT = 250;

test.describe.serial("registrar pago y ver saldo", () => {
  test("flujo completo: ver → registrar pago → ver saldo actualizado → ver historial", async ({
    page,
  }) => {
    // 1. Ir al listado de ventas y abrir el comprobante de seed.
    await page.goto("/ventas/listado");

    const verBtn = page.getByRole("button", { name: "Ver" }).first();
    await expect(verBtn).toBeVisible({ timeout: 15_000 });
    await verBtn.click();

    // El modal muestra el número del comprobante de seed.
    await expect(page.getByText(SALE_NUMBER_FRAGMENT)).toBeVisible();

    // 2. Click en "Registrar pago" → navega a /pagos/ingresos con comprobanteId.
    await page.getByRole("link", { name: "Registrar pago" }).first().click();

    await expect(page).toHaveURL(/\/pagos\/ingresos/);

    // 3. Abrir el formulario de pago y registrar uno parcial.
    await page.getByRole("button", { name: "Registrar pago" }).first().click();

    const amountInput = page.getByLabel(/importe/i);
    await expect(amountInput).toBeVisible();
    await amountInput.fill(String(PAYMENT_AMOUNT));

    await page.getByRole("button", { name: /^registrar$/i }).click();

    // 4. Volver al listado y verificar que el saldo refleja el pago parcial.
    await page.goto("/ventas/listado");

    // El saldo debería ser 1000 - 250 = 750 (asume total=1000).
    await expect(page.getByText("750")).toBeVisible({ timeout: 10_000 });

    // 5. Reabrir el detalle y verificar que el historial muestra el pago recién creado.
    await page.getByRole("button", { name: "Ver" }).first().click();
    await expect(page.getByText("Historial de pagos")).toBeVisible();

    // La fila del pago aparece con su número de recibo (RI-NNNNNN).
    await expect(page.locator("text=/RI-\\d{6}/")).toBeVisible();
  });
});
