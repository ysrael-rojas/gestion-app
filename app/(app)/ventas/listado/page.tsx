import { VentasListadoView } from "@/components/ventas/ventas-listado-view";
import { parseListadoFilters } from "@/lib/filters/listado-filters";

export default async function VentasListadoPage({
  searchParams,
}: PageProps<"/ventas/listado">) {
  const params = await searchParams;
  const filters = parseListadoFilters(params);

  return <VentasListadoView filters={filters} />;
}
