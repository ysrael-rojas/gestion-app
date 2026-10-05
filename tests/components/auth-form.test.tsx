import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const signIn = vi.fn();
const signUp = vi.fn();

vi.mock("@/app/login/actions", () => ({
  signIn: (...args: unknown[]) => signIn(...args),
  signUp: (...args: unknown[]) => signUp(...args),
}));

import { AuthForm } from "@/components/auth/auth-form";

describe("AuthForm", () => {
  beforeEach(() => {
    signIn.mockReset();
    signUp.mockReset();
  });

  it("en modo login pide correo, contraseña y no pide confirmación", () => {
    render(<AuthForm mode="login" />);

    expect(screen.getByLabelText("Correo")).toBeInTheDocument();
    expect(screen.getByLabelText("Contraseña")).toBeInTheDocument();
    expect(screen.queryByLabelText("Confirmar contraseña")).not.toBeInTheDocument();
  });

  it("en modo registro agrega el campo de confirmación", () => {
    render(<AuthForm mode="signup" />);

    expect(screen.getByLabelText("Confirmar contraseña")).toBeInTheDocument();
  });

  it("bloquea el envío si el correo no es válido", async () => {
    const user = userEvent.setup();
    render(<AuthForm mode="login" />);

    await user.type(screen.getByLabelText("Correo"), "no-es-correo");
    await user.type(screen.getByLabelText("Contraseña"), "secreto123");
    await user.click(screen.getByRole("button", { name: "Iniciar sesión" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Ingresa un correo válido"
    );
    expect(signIn).not.toHaveBeenCalled();
  });

  it("muestra el error del servidor sin navegar", async () => {
    const user = userEvent.setup();
    signIn.mockResolvedValue({
      error: "Correo o contraseña incorrectos",
      success: null,
    });

    render(<AuthForm mode="login" />);

    await user.type(screen.getByLabelText("Correo"), "admin@gestion.pe");
    await user.type(screen.getByLabelText("Contraseña"), "incorrecta");
    await user.click(screen.getByRole("button", { name: "Iniciar sesión" }));

    await waitFor(() => expect(signIn).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Correo o contraseña incorrectos"
    );
  });

  it("muestra el mensaje de exito del registro sin navegar", async () => {
    const user = userEvent.setup();
    signUp.mockResolvedValue({
      error: null,
      success: "Cuenta creada. Revisa tu correo para confirmar la cuenta.",
    });

    render(<AuthForm mode="signup" />);

    await user.type(screen.getByLabelText("Correo"), "yrra@gmail.com");
    await user.type(screen.getByLabelText("Contraseña"), "secreto123");
    await user.type(
      screen.getByLabelText("Confirmar contraseña"),
      "secreto123"
    );
    await user.click(screen.getByRole("button", { name: "Crear cuenta" }));

    await waitFor(() => expect(signUp).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Cuenta creada. Revisa tu correo"
    );
  });

  it("envia confirmPassword solo en modo registro", async () => {
    const user = userEvent.setup();
    signUp.mockResolvedValue({ error: null, success: "Cuenta creada." });

    render(<AuthForm mode="signup" />);

    await user.type(screen.getByLabelText("Correo"), "yrra@gmail.com");
    await user.type(screen.getByLabelText("Contraseña"), "secreto123");
    await user.type(
      screen.getByLabelText("Confirmar contraseña"),
      "secreto123"
    );
    await user.click(screen.getByRole("button", { name: "Crear cuenta" }));

    await waitFor(() => expect(signUp).toHaveBeenCalledTimes(1));

    const [, formData] = signUp.mock.calls[0] as [unknown, FormData];
    expect(formData.get("confirmPassword")).toBe("secreto123");
    expect(formData.get("email")).toBe("yrra@gmail.com");
  });
});