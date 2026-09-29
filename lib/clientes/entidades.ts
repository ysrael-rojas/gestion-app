import type { Client } from "@/components/clientes/types";
import type { ClientFormValues } from "@/lib/schemas/client";
import { supabase } from "@/lib/supabase/client";
import type { Tables } from "@/lib/supabase/types";

type EntityRow = Tables<"entidad">;

type EntityMutation = Pick<
  EntityRow,
  | "document_type"
  | "document_number"
  | "name"
  | "address"
  | "phone"
  | "contact_name"
  | "billing_email"
  | "management_email"
  | "is_supplier"
>;

function mapFormValues(values: ClientFormValues): EntityMutation {
  return {
    document_type: values.documentType,
    document_number:
      values.documentType === "SIN_DOCUMENTO" ? "" : values.documentNumber,
    name: values.name,
    address: values.address,
    phone: values.phone,
    contact_name: values.contactName,
    billing_email: values.billingEmail,
    management_email: values.managementEmail,
    is_supplier: values.isSupplier,
  };
}

function mapRow(row: EntityRow): Client {
  return {
    id: row.id,
    documentType: row.document_type,
    documentNumber: row.document_number,
    name: row.name,
    address: row.address,
    phone: row.phone,
    contactName: row.contact_name,
    billingEmail: row.billing_email,
    managementEmail: row.management_email,
    isSupplier: row.is_supplier,
  };
}

function mapError(error: { code?: string; message: string }): Error {
  if (error.code === "23505") {
    return new Error(
      "Ya existe un cliente con ese tipo y número de documento."
    );
  }

  return new Error(
    "No se pudo completar la operación con la base de datos. Intenta nuevamente."
  );
}

export async function listClients(): Promise<Client[]> {
  const { data, error } = await supabase
    .from("entidad")
    .select("*")
    .eq("is_client", true)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    throw mapError(error);
  }

  return (data as EntityRow[]).map(mapRow);
}

export async function listSuppliers(): Promise<Client[]> {
  const { data, error } = await supabase
    .from("entidad")
    .select("*")
    .eq("is_supplier", true)
    .is("deleted_at", null)
    .order("name", { ascending: true });

  if (error) {
    throw mapError(error);
  }

  return (data as EntityRow[]).map(mapRow);
}

export async function createClientRecord(
  values: ClientFormValues
): Promise<Client> {
  const { data, error } = await supabase
    .from("entidad")
    .insert({ ...mapFormValues(values), is_client: true })
    .select()
    .single();

  if (error) {
    throw mapError(error);
  }

  return mapRow(data as EntityRow);
}

export async function updateClientRecord(
  id: string,
  values: ClientFormValues
): Promise<Client> {
  const { data, error } = await supabase
    .from("entidad")
    .update(mapFormValues(values))
    .eq("id", id)
    .select()
    .single();

  if (error) {
    throw mapError(error);
  }

  return mapRow(data as EntityRow);
}

export async function softDeleteClient(id: string): Promise<void> {
  const { error } = await supabase
    .from("entidad")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    throw mapError(error);
  }
}
