import { expect, test, type Page } from "@playwright/test";

/**
 * E2E: registrar el pago total de una venta desde el drawer único de pago
 * (SPEC 45) y verificar que el comprobante queda PAGADO con saldo 0.
 * El botón "Ver" del listado navega a la página de detalle (`/ventas/[id]`),
 * que muestra la banda de montos y las pestañas de datos e historial.
 *
 * Seed requerido en la DB de desarrollo antes de correr este test:
 *   - 1 usuario con credenciales válidas en `.env`: `USUARIO` y `PASSWORD`.
 *   - 1 venta (voucher_kind = "VENTA") con status "PENDIENTE" y saldo > 0,
 *     visible en la primera página de `/ventas`. El test elige la
 *     primera fila con botón "Registrar pago" (Wallet), así que no exige un
 *     número concreto.
 *   - 1 caja activa (tipo CASH_BOX) — por defecto se elige "Caja General" —
 *     sin cierres de caja cuyo periodo cubra la fecha de hoy
 *     (`assert_payment_account_open` rechazaría el pago).
 *   - Catálogo de métodos y categorías semilla: la app los siembra sola al
 *     abrir el módulo (ensureCatalogsSeeded).
 *
 * Variables de entorno (se cargan desde `.env` con process.loadEnvFile):
 *   - USUARIO / PASSWORD: credenciales de la app.
 *   - E2E_METHOD_NAME (opcional): método de pago a elegir (default "Efectivo").
 *   - E2E_ACCOUNT_NAME (opcional): cuenta del asistente (default "Caja General").
 *
 * Para correrlo localmente:
 *   1) Cargar el seed descrito arriba.
 *   2) `npm run test:e2e` (playwright.config levanta `npm run dev`).
 *
 * OJO: el test paga el saldo completo del comprobante elegido, que queda
 * PAGADO. Para re-correrlo hace falta otra venta PENDIENTE con saldo.
 */

try {
  process.loadEnvFile();
} catch {
  // Sin .env (CI): los tests se saltan por falta de credenciales.
}

const METHOD_NAME = process.env.E2E_METHOD_NAME ?? "Efectivo";
const ACCOUNT_NAME = process.env.E2E_ACCOUNT_NAME ?? "Caja General";

async function login(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Correo").fill(process.env.USUARIO ?? "");
  await page.getByLabel("Contraseña").fill(process.env.PASSWORD ?? "");
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 20_000 });
}

// Elige una opción de un Select de base-ui por su texto visible (coincidencia
// parcial: las cuentas muestran "Nombre · MONEDA").
async function selectOption(
  page: Page,
  triggerSelector: string,
  optionName: string
): Promise<void> {
  await page.locator(triggerSelector).click();
  await page.getByRole("option", { name: optionName }).click();
}

test.describe.serial("registrar pago y ver saldo", () => {
  test("flujo completo: ventas → Wallet → asistente de drawers → PAGADO con saldo 0", async ({
    page,
  }) => {
    test.skip(
      !process.env.USUARIO || !process.env.PASSWORD,
      "Faltan USUARIO/PASSWORD en .env: el e2e necesita credenciales válidas."
    );

    // 1. Iniciar sesión e ir al listado de ventas.
    await login(page);
    await page.goto("/ventas");

    // 2. Tomar la primera venta PENDIENTE (fila con botón Wallet "Registrar pago").
    const row = page
      .getByRole("row")
      .filter({ has: page.getByRole("button", { name: "Registrar pago" }) })
      .first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(row).toContainText("Pendiente");

    const cells = await row.locator("td").allInnerTexts();
    const voucherNumber =
      cells.find((text) => /[A-Z0-9]+-\d+/.test(text)) ?? cells[0] ?? "";

    // 3. Abrir el drawer único y completar los campos.
    await row.getByRole("button", { name: "Registrar pago" }).click();

    await expect(
      page.getByRole("heading", { name: "Registrar pago" })
    ).toBeVisible();
    await expect(page.getByText(voucherNumber).first()).toBeVisible();

    // Importe precargado con el saldo → se paga completo.
    const amountInput = page.locator("#payment-amount");
    await expect(amountInput).not.toHaveValue("");

    // Método y cuenta (la categoría viene fijada por código).
    await selectOption(page, "#payment-method", METHOD_NAME);
    await selectOption(page, "#payment-account", ACCOUNT_NAME);

    // Sin pasos intermedios: registrar directamente.
    await page
      .getByRole("button", { name: "Registrar pago" })
      .last()
      .click();
    await expect(page.getByText("Pago registrado")).toBeVisible({
      timeout: 15_000,
    });

    // 4. Volver al listado y verificar que el comprobante quedó PAGADO.
    await page.goto("/ventas");
    const rowAfter = page.getByRole("row", { name: new RegExp(voucherNumber) });
    await expect(rowAfter).toBeVisible({ timeout: 15_000 });
    await expect(rowAfter).toContainText("Pagado");

    // 5. Abrir la página de detalle: la banda de montos muestra saldo 0 y el
    //    historial de pagos registra el recibo recién creado.
    await rowAfter.getByRole("button", { name: "Ver" }).click();
    await expect(page).toHaveURL(/\/ventas\/[0-9a-f-]{36}$/i, {
      timeout: 15_000,
    });
    const saldoBand = page.getByText("Saldo por pagar").locator("..");
    await expect(saldoBand).toBeVisible({ timeout: 15_000 });
    await expect(saldoBand).toContainText("0.00");

    await page.getByRole("button", { name: /Historial de pagos/ }).click();
    await expect(page.locator("text=/RI-\\d{6}/").first()).toBeVisible({
      timeout: 10_000,
    });
  });
});
