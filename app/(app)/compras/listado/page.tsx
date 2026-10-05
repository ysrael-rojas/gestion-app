import { ComprasListadoView } from "@/components/compras/compras-listado-view";
import { parseListadoFilters } from "@/lib/filters/listado-filters";

export default async function ComprasListadoPage({
  searchParams,
}: PageProps<"/compras/listado">) {
  const params = await searchParams;
  const filters = parseListadoFilters(params);

  return <ComprasListadoView filters={filters} />;
}
