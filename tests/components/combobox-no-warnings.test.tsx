import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  EntityAutocomplete,
  toEntityAutocompleteItems,
} from "@/components/shared/entity-autocomplete";

const SAMPLE_ITEMS = [
  { id: "1", name: "Abarrotes Don Pepe", documentType: "RUC", documentNumber: "20123456789" },
];

describe("EntityAutocomplete — sin warnings de Base UI", () => {
  it("no emite warning de nativeButton al abrir el combobox", async () => {
    const user = userEvent.setup();
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

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
    await user.type(input, "a");

    const nativeButtonWarnings = consoleErrorSpy.mock.calls.filter((args) =>
      args.some(
        (arg) =>
          typeof arg === "string" &&
          arg.includes("nativeButton") &&
          arg.includes("expected a native <button>")
      )
    );

    expect(nativeButtonWarnings).toEqual([]);

    consoleErrorSpy.mockRestore();
  });
});