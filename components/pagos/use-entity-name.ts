"use client";

import { useCallback, useEffect, useState } from "react";

import { useClientes } from "@/components/clientes/clientes-provider";
import type { Client } from "@/components/clientes/types";
import type { PaymentDirection } from "@/components/pagos/types";
import { listSuppliers } from "@/lib/clientes/entidades";

/**
 * Resuelve el nombre de una entidad a partir de su id.
 * Un id nulo (pago sin entidad) resuelve a "—".
 */
export type EntityNameResolver = (entityId: string | null) => string;

export function resolveEntityName(
  entities: Array<Pick<Client, "id" | "name">>,
  entityId: string | null
): string {
  if (!entityId) {
    return "—";
  }

  return (
    entities.find((entity) => entity.id === entityId)?.name ??
    "Entidad no encontrada"
  );
}

/**
 * Devuelve una función que resuelve nombres de entidad buscando en clientes y
 * proveedores. Para INGRESO usa la lista de clientes del provider; para EGRESO
 * carga además los proveedores (`listSuppliers`). Un id nulo resuelve a "—".
 */
export function useEntityNameResolver(
  direction: PaymentDirection
): EntityNameResolver {
  const { clients } = useClientes();
  const [suppliers, setSuppliers] = useState<Client[]>([]);

  useEffect(() => {
    if (direction !== "EGRESO") {
      return;
    }

    let isMounted = true;

    void (async () => {
      try {
        const data = await listSuppliers();

        if (isMounted) {
          setSuppliers(data);
        }
      } catch {
        if (isMounted) {
          setSuppliers([]);
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [direction]);

  const entities = direction === "EGRESO" ? suppliers : clients;

  return useCallback(
    (entityId: string | null) => resolveEntityName(entities, entityId),
    [entities]
  );
}
