export type DocumentType =
  | "RUC"
  | "DNI"
  | "CARNET_EXTRANJERIA"
  | "SIN_DOCUMENTO";

export interface Client {
  id: string;
  documentType: DocumentType;
  documentNumber: string;
  name: string;
  address: string;
  phone: string;
  contactName: string;
  billingEmail: string;
  managementEmail: string;
  isSupplier?: boolean;
}
