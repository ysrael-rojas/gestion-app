import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  EntityAutocomplete,
  toEntityAutocompleteItem,
  toEntityAutocompleteItems,
} from "@/components/shared/entity-autocomplete";

const SAMPLE_ITEMS = [
  { id: "1", name: "Abarrotes Don Pepe", documentType: "RUC", documentNumber: "20123456789" },
  { id: "2", name: "Bodega María", documentType: "DNI", documentNumber: "12345678" },
  { id: "3", name: "Comercial Sol", documentType: "RUC", documentNumber: "20987654321" },
  { id: "4", name: "Distribuidora Norte", documentType: "SIN_DOCUMENTO", documentNumber: "" },
];

describe("EntityAutocomplete", () => {
  it("muestra el placeholder cuando no hay valor seleccionado", () => {
    render(
      <EntityAutocomplete
        items={toEntityAutocompleteItems(SAMPLE_ITEMS)}
        value={null}
        onValueChange={() => {}}
        placeholder="Buscar cliente..."
      />
    );

    const input = screen.getByPlaceholderText("Buscar cliente...");
    expect(input).toBeInTheDocument();
    expect(input).not.toBeDisabled();
  });

  it("deshabilita y muestra 'Cargando...' cuando isLoading=true", () => {
    render(
      <EntityAutocomplete
        items={[]}
        value={null}
        onValueChange={() => {}}
        isLoading
        placeholder="Buscar cliente..."
      />
    );

    const input = screen.getByPlaceholderText("Cargando...");
    expect(input).toBeInTheDocument();
    expect(input).toBeDisabled();
  });

  it("deshabilita y muestra mensaje de lista vacía cuando no hay items y no está cargando", () => {
    render(
      <EntityAutocomplete
        items={[]}
        value={null}
        onValueChange={() => {}}
        placeholder="Buscar cliente..."
      />
    );

    const input = screen.getByPlaceholderText("No hay entidades disponibles");
    expect(input).toBeInTheDocument();
    expect(input).toBeDisabled();
  });

  it("propaga onValueChange con el id del item al hacer click", async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();

    render(
      <EntityAutocomplete
        items={toEntityAutocompleteItems(SAMPLE_ITEMS)}
        value={null}
        onValueChange={handleChange}
        placeholder="Buscar cliente..."
      />
    );

    const input = screen.getByPlaceholderText("Buscar cliente...");
    await user.click(input);

    const option = await screen.findByText("Bodega María");
    await user.click(option);

    expect(handleChange).toHaveBeenCalledWith("2");
  });

  it("incluye el documento como secondaryLabel en el item", async () => {
    const user = userEvent.setup();

    render(
      <EntityAutocomplete
        items={toEntityAutocompleteItems(SAMPLE_ITEMS)}
        value={null}
        onValueChange={() => {}}
        placeholder="Buscar cliente..."
      />
    );

    const input = screen.getByPlaceholderText("Buscar cliente...");
    await user.click(input);

    expect(await screen.findByText("RUC 20123456789")).toBeInTheDocument();
    expect(screen.getByText("DNI 12345678")).toBeInTheDocument();
  });

  it("omite el secondaryLabel cuando el documento es SIN_DOCUMENTO", async () => {
    const user = userEvent.setup();

    render(
      <EntityAutocomplete
        items={toEntityAutocompleteItems(SAMPLE_ITEMS)}
        value={null}
        onValueChange={() => {}}
        placeholder="Buscar cliente..."
      />
    );

    const input = screen.getByPlaceholderText("Buscar cliente...");
    await user.click(input);

    // El nombre sí debe estar; no debe existir ningún texto secundario para esa entidad.
    expect(await screen.findByText("Distribuidora Norte")).toBeInTheDocument();
    expect(
      screen.queryByText(/^SIN_DOCUMENTO|^Sin documento/i)
    ).not.toBeInTheDocument();
  });

  it("filtra por nombre al escribir", async () => {
    const user = userEvent.setup();

    render(
      <EntityAutocomplete
        items={toEntityAutocompleteItems(SAMPLE_ITEMS)}
        value={null}
        onValueChange={() => {}}
        placeholder="Buscar cliente..."
      />
    );

    const input = screen.getByPlaceholderText("Buscar cliente...");
    await user.click(input);
    await user.type(input, "norte");

    expect(await screen.findByText("Distribuidora Norte")).toBeInTheDocument();
    expect(screen.queryByText("Abarrotes Don Pepe")).not.toBeInTheDocument();
    expect(screen.queryByText("Bodega María")).not.toBeInTheDocument();
  });
});

describe("toEntityAutocompleteItem", () => {
  it("construye el secondaryLabel con tipo y número", () => {
    const item = toEntityAutocompleteItem(SAMPLE_ITEMS[0]);
    expect(item).toEqual({
      value: "1",
      label: "Abarrotes Don Pepe",
      secondaryLabel: "RUC 20123456789",
    });
  });

  it("omite el secondaryLabel cuando no hay documento", () => {
    const item = toEntityAutocompleteItem(SAMPLE_ITEMS[3]);
    expect(item).toEqual({
      value: "4",
      label: "Distribuidora Norte",
      secondaryLabel: undefined,
    });
  });
});