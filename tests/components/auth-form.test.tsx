import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const signIn = vi.fn();

vi.mock("@/app/login/actions", () => ({
  signIn: (...args: unknown[]) => signIn(...args),
}));

import { AuthForm } from "@/components/auth/auth-form";

describe("AuthForm", () => {
  beforeEach(() => {
    signIn.mockReset();
  });

  it("solo pide correo y contraseña: sin confirmación ni link de alta", () => {
    render(<AuthForm />);

    expect(screen.getByLabelText("Correo")).toBeInTheDocument();
    expect(screen.getByLabelText("Contraseña")).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Confirmar contraseña")
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /crear cuenta/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Crear cuenta" })
    ).not.toBeInTheDocument();
  });

  it("bloquea el envío si el correo no es válido", async () => {
    const user = userEvent.setup();
    render(<AuthForm />);

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

    render(<AuthForm />);

    await user.type(screen.getByLabelText("Correo"), "admin@gestion.pe");
    await user.type(screen.getByLabelText("Contraseña"), "incorrecta");
    await user.click(screen.getByRole("button", { name: "Iniciar sesión" }));

    await waitFor(() => expect(signIn).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Correo o contraseña incorrectos"
    );
  });
});
