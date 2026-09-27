import { z } from "zod";

import type { DocumentType } from "@/components/clientes/types";
import { DOCUMENT_TYPES } from "@/lib/data/document-types";

const DOCUMENT_NUMBER_PATTERNS: Record<
  Exclude<DocumentType, "SIN_DOCUMENTO">,
  RegExp
> = {
  RUC: /^\d{11}$/,
  DNI: /^\d{8}$/,
  CARNET_EXTRANJERIA: /^[A-Za-z0-9]{9,12}$/,
};

const documentTypeEnum = z.enum(
  DOCUMENT_TYPES.map((option) => option.value) as [
    DocumentType,
    ...DocumentType[],
  ]
);

const isValidEmail = (value: string) => z.email().safeParse(value).success;

export const clientSchema = z
  .object({
    documentType: documentTypeEnum,
    documentNumber: z.string(),
    name: z.string().min(1, "El nombre es requerido"),
    address: z.string(),
    phone: z.string(),
    contactName: z.string(),
    billingEmail: z
      .string()
      .refine(isValidEmail, {
        error: "Ingresa un correo de facturación válido",
      }),
    managementEmail: z.string().refine(
      (value) => value.trim() === "" || isValidEmail(value.trim()),
      { error: "Ingresa un correo de gestión válido" }
    ),
  })
  .superRefine((data, ctx) => {
    if (data.documentType === "SIN_DOCUMENTO") {
      return;
    }

    const pattern = DOCUMENT_NUMBER_PATTERNS[data.documentType];

    if (!pattern.test(data.documentNumber)) {
      ctx.addIssue({
        code: "custom",
        path: ["documentNumber"],
        message: "Número de documento inválido",
      });
    }
  });

export type ClientFormValues = z.infer<typeof clientSchema>;
