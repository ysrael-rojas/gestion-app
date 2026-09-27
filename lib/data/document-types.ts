import type { DocumentType } from "@/components/clientes/types";

export interface DocumentTypeOption {
  value: DocumentType;
  label: string;
  placeholder: string;
}

export const DOCUMENT_TYPES: DocumentTypeOption[] = [
  { value: "RUC", label: "RUC", placeholder: "20512345678" },
  { value: "DNI", label: "DNI", placeholder: "12345678" },
  {
    value: "CARNET_EXTRANJERIA",
    label: "Carné de extranjería",
    placeholder: "C1A2B3C4D",
  },
  {
    value: "SIN_DOCUMENTO",
    label: "Sin documento",
    placeholder: "Sin documento",
  },
];

export const DEFAULT_DOCUMENT_TYPE: DocumentType = "SIN_DOCUMENTO";

export function getDocumentTypeOption(
  type: DocumentType
): DocumentTypeOption {
  return (
    DOCUMENT_TYPES.find((option) => option.value === type) ??
    DOCUMENT_TYPES.find((option) => option.value === DEFAULT_DOCUMENT_TYPE)!
  );
}
