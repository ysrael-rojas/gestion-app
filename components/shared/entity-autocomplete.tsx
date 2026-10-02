"use client";

import { useMemo } from "react";

import {
  Combobox,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxPopup,
} from "@/components/ui/combobox";

export interface EntityAutocompleteItem {
  value: string;
  label: string;
  secondaryLabel?: string;
}

interface DocumentLike {
  documentType: string;
  documentNumber: string;
}

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  RUC: "RUC",
  DNI: "DNI",
  CARNET_EXTRANJERIA: "Carnet ext.",
};

/**
 * Convierte una entidad con `documentType` y `documentNumber` al shape que
 * consume `EntityAutocomplete`. Si la entidad no tiene documento
 * (`SIN_DOCUMENTO`), el `secondaryLabel` queda como `undefined`.
 */
export function toEntityAutocompleteItem(entity: DocumentLike & {
  id: string;
  name: string;
}): EntityAutocompleteItem {
  const { id, name, documentType, documentNumber } = entity;
  const typeLabel = DOCUMENT_TYPE_LABELS[documentType];
  const secondaryLabel =
    typeLabel && documentNumber
      ? `${typeLabel} ${documentNumber}`
      : undefined;

  return {
    value: id,
    label: name,
    secondaryLabel,
  };
}

export function toEntityAutocompleteItems<T extends DocumentLike & {
  id: string;
  name: string;
}>(entities: T[]): EntityAutocompleteItem[] {
  return entities.map(toEntityAutocompleteItem);
}

interface EntityAutocompleteProps {
  items: EntityAutocompleteItem[];
  value: string | null;
  onValueChange: (value: string) => void;
  placeholder?: string;
  emptyMessage?: string;
  loadingMessage?: string;
  isLoading?: boolean;
  isDisabled?: boolean;
  id?: string;
  name?: string;
  "aria-invalid"?: boolean;
}

/**
 * Autocomplete compartido para seleccionar un cliente o proveedor.
 *
 * Muestra el `label` como línea principal y, si está disponible, un
 * `secondaryLabel` (típicamente el documento: `RUC 12345678`) en una
 * segunda línea en `text-muted-foreground`.
 *
 * El filtrado es local (en cliente); base-ui hace match case-insensitive
 * contra `label`. Si la lista crece a miles de registros conviene mover
 * el filtrado a backend.
 */
export function EntityAutocomplete({
  items,
  value,
  onValueChange,
  placeholder = "Buscar...",
  emptyMessage = "Sin coincidencias.",
  loadingMessage = "Cargando...",
  isLoading = false,
  isDisabled = false,
  id,
  name,
  "aria-invalid": ariaInvalid,
}: EntityAutocompleteProps) {
  const disabled = isDisabled || isLoading || items.length === 0;

  const placeholderText = useMemo(() => {
    if (isLoading) return loadingMessage;
    if (items.length === 0) return "No hay entidades disponibles";
    return placeholder;
  }, [isLoading, items.length, loadingMessage, placeholder]);

  const selectedItem = useMemo(
    () => items.find((item) => item.value === value) ?? null,
    [items, value]
  );

  return (
    <Combobox
      items={items}
      value={selectedItem}
      onValueChange={(item: EntityAutocompleteItem | null) =>
        onValueChange(item?.value ?? "")
      }
      disabled={disabled}
      itemToStringLabel={(item: EntityAutocompleteItem) => item.label}
    >
      <ComboboxInput
        id={id}
        name={name}
        placeholder={placeholderText}
        disabled={disabled}
        aria-invalid={ariaInvalid}
      />
      <ComboboxPopup>
        <ComboboxList>
          {(item: EntityAutocompleteItem) => (
            <ComboboxItem key={item.value} value={item}>
              <span className="font-medium">{item.label}</span>
              {item.secondaryLabel ? (
                <span className="text-xs text-muted-foreground">
                  {item.secondaryLabel}
                </span>
              ) : null}
            </ComboboxItem>
          )}
        </ComboboxList>
        <ComboboxEmpty>{emptyMessage}</ComboboxEmpty>
      </ComboboxPopup>
    </Combobox>
  );
}