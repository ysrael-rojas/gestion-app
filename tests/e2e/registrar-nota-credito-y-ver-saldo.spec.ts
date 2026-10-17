import { expect, test, type Page } from "@playwright/test";

/**
 * E2E: registrar una nota de crédito emitida (SPEC 39) sobre una venta y
 * verificar que el saldo de la venta baja por el monto de la nota.
 *
 * Seed requerido en la DB de desarrollo antes de correr este test:
 *   - 1 usuario con credenciales válidas en `.env`: `USUARIO` y `PASSWORD`.
 *   - 1 venta (voucher_kind = "VENTA") con status "PENDIENTE" y visible en la
 *     primera página de `/ventas/listado` (fila con botón "Registrar pago").
 *     El test elige la primera fila con Wallet, así que no exige un número
 *     concreto; su tope disponible (total − NC y retenciones ya aplicadas)
 *     debe ser ≥ 10.00.
 *
 * El test registra una NC de S/ 10.00 con motivo "Anulación de la operación"
 * y número único por corrida (FC01-<timestamp>) y verifica que:
 *   1. La NC aparece en `/notas/credito` como "Emitida" con su motivo y el
 *      número del comprobante referenciado.
 *   2. El saldo de la venta referenciada baja exactamente 10.00 (detalle).
 *
 * OJO: crea una NC real en cada corrida: el saldo de la venta baja 10.00 por
 * corrida y su tope se agota tras N corridas (N = tope ÷ 10). Para re-correrlo
 * con holgura, sembrar otra venta PENDIENTE.
 *
 * Para correrlo localmente:
 *   1) Cargar el seed descrito arriba.
 *   2) `npm run test:e2e` (playwright.config arranca o reusa `npm run dev`).
 */

try {
  process.loadEnvFile();
} catch {
  // Sin .env (CI): los tests se saltan por falta de credenciales.
}

const NOTE_AMOUNT = "10";
const MOTIVE_LABEL = "Anulación de la operación";

async function login(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Correo").fill(process.env.USUARIO ?? "");
  await page.getByLabel("Contraseña").fill(process.env.PASSWORD ?? "");
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 20_000 });
}

/** Extrae el primer importe "1,234.56" de un texto ("S/ 1,234.56" → 1234.56). */
function parseAmount(text: string): number {
  const match = text.replace(/\u00a0/g, " ").match(/([\d,]+\.\d{2})/);
  return match ? Number(match[1].replace(/,/g, "")) : Number.NaN;
}

test.describe.serial("registrar nota de credito y ver saldo", () => {
  test("flujo completo: venta PENDIENTE → NC emitida → saldo baja", async ({
    page,
  }) => {
    test.skip(
      !process.env.USUARIO || !process.env.PASSWORD,
      "Faltan USUARIO/PASSWORD en .env: el e2e necesita credenciales válidas."
    );

    // 1. Elegir la primera venta PENDIENTE y leer su saldo actual.
    await login(page);
    await page.goto("/ventas/listado");

    const saleRow = page
      .getByRole("row")
      .filter({ has: page.getByRole("button", { name: "Registrar pago" }) })
      .first();
    await expect(saleRow).toBeVisible({ timeout: 15_000 });

    const cells = await saleRow.locator("td").allInnerTexts();
    const saleNumber = cells.find((text) => /[A-Z0-9]+-\d+/.test(text)) ?? "";

    await saleRow.getByRole("button", { name: "Ver" }).click();
    const saldoBand = page.getByText("Saldo por pagar").locator("..");
    await expect(saldoBand).toBeVisible({ timeout: 15_000 });
    const saldoBefore = parseAmount(await saldoBand.innerText());
    await page.getByRole("button", { name: "Cerrar" }).click();

    // 2. Registrar la NC emitida sobre esa venta.
    const noteNumber = `FC01-${String(Date.now()).slice(-6)}`;

    await page.goto("/notas/credito");
    await page
      .getByRole("button", { name: "Registrar nota de crédito" })
      .click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 15_000 });

    await page.locator("#referencedComprobanteId").click();
    await page.getByRole("option", { name: new RegExp(saleNumber) }).click();

    // El resumen del referenciado aparece con el tope disponible.
    await expect(
      page.getByText("Tope disponible para este documento")
    ).toBeVisible();

    await page.locator("#voucherNumber").fill(noteNumber);
    await page.locator("#motiveCode").click();
    await page.getByRole("option", { name: MOTIVE_LABEL }).click();
    await page.locator("#total").fill(NOTE_AMOUNT);

    await page.getByRole("button", { name: "Registrar", exact: true }).click();
    await expect(page.getByText("Documento registrado")).toBeVisible({
      timeout: 15_000,
    });

    // 3. La NC aparece en su listado como Emitida y con la venta referenciada.
    const noteRow = page.getByRole("row", { name: new RegExp(noteNumber) });
    await expect(noteRow).toBeVisible({ timeout: 15_000 });
    await expect(noteRow).toContainText("Emitida");
    await expect(noteRow).toContainText(MOTIVE_LABEL);
    await expect(noteRow).toContainText(saleNumber);

    // 4. El saldo de la venta bajó exactamente por el monto de la nota.
    await page.goto("/ventas/listado");
    const saleRowAfter = page.getByRole("row", {
      name: new RegExp(saleNumber),
    });
    await expect(saleRowAfter).toBeVisible({ timeout: 15_000 });
    await saleRowAfter.getByRole("button", { name: "Ver" }).click();

    const saldoBandAfter = page.getByText("Saldo por pagar").locator("..");
    await expect(saldoBandAfter).toBeVisible({ timeout: 15_000 });
    const saldoAfter = parseAmount(await saldoBandAfter.innerText());

    expect(saldoAfter).toBeCloseTo(saldoBefore - Number(NOTE_AMOUNT), 2);
  });
});
