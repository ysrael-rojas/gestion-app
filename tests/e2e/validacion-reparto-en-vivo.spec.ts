import { expect, test, type Page } from "@playwright/test";

/**
 * E2E (sin mutaciones): la validación en vivo del reparto de un pago avisa
 * ANTES de enviar el formulario, sin llegar a la RPC (SPEC 37).
 *
 * Seed requerido (mismas credenciales que registrar-pago-y-ver-saldo.spec.ts):
 *   - `.env` con `USUARIO` y `PASSWORD`.
 *   - 1 cliente con al menos 1 factura con saldo > 0. Por defecto se busca
 *     "TEXTILES DEL NORTE SRL" (configurable con E2E_ENTITY_NAME), cuya
 *     factura aparece primera en el picker por vencimiento.
 *
 * Este test NO registra pagos: solo abre el formulario de "Registrar pago",
 * manipula importes y verifica los mensajes inline. Es re-ejecutable.
 */

try {
  process.loadEnvFile();
} catch {
  // Sin .env (CI): los tests se saltan por falta de credenciales.
}

const ENTITY_NAME = process.env.E2E_ENTITY_NAME ?? "TEXTILES DEL NORTE SRL";

async function login(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Correo").fill(process.env.USUARIO ?? "");
  await page.getByLabel("Contraseña").fill(process.env.PASSWORD ?? "");
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 20_000 });
}

test.describe.serial("validación en vivo del reparto", () => {
  test("repartir más que el importe muestra error inline sin enviar el formulario", async ({
    page,
  }) => {
    test.skip(
      !process.env.USUARIO || !process.env.PASSWORD,
      "Faltan USUARIO/PASSWORD en .env: el e2e necesita credenciales válidas."
    );

    await login(page);
    await page.goto("/pagos/ingresos");

    // Abrir el formulario de pago (botón del encabezado de la vista).
    await page.getByRole("button", { name: "Registrar pago" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 15_000 });

    // Elegir la entidad: el picker carga sus facturas con saldo.
    await dialog.getByLabel(/Cliente\/Proveedor/).fill("TEXTILES");
    await page.getByRole("option", { name: ENTITY_NAME }).click();

    const checkboxes = dialog.getByRole("checkbox");
    await expect(checkboxes.first()).toBeVisible({ timeout: 15_000 });

    // Importe del pago: 100 soles.
    await dialog.getByLabel("Importe", { exact: true }).fill("100");

    // Seleccionar la primera factura: el reparto se clampea a 100.
    await checkboxes.first().check();
    const rowAmount = dialog.getByLabel(/Importe a asignar a/).first();
    await expect(rowAmount).toHaveValue("100");

    // Intentar repartir más que el importe: el error aparece inline, sin
    // enviar el formulario ni llegar a la RPC.
    await rowAmount.fill("99999");
    await expect(
      page.getByText(/El reparto supera el importe del pago/)
    ).toBeVisible();

    // Corregir el reparto: el error desaparece.
    await rowAmount.fill("100");
    await expect(
      page.getByText(/El reparto supera el importe del pago/)
    ).toBeHidden();

    // Cerrar sin registrar: el test no deja mutaciones.
    await dialog.getByRole("button", { name: "Cancelar" }).click();
    await expect(dialog).toBeHidden();
  });
});
