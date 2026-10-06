import type { ClosingPeriodicity } from "@/components/pagos/types";
import type { SelectOption } from "@/lib/data/sale-options";

export const CLOSING_PERIODICITIES: SelectOption<ClosingPeriodicity>[] = [
  { value: "DAILY", label: "Diario" },
  { value: "WEEKLY", label: "Semanal" },
  { value: "MONTHLY", label: "Mensual" },
];

export const CLOSING_PERIODICITY_OPTIONS: SelectOption<string>[] = [
  { value: "DEFAULT", label: "Predeterminado (global)" },
  ...CLOSING_PERIODICITIES,
];

export function getPeriodicityLabel(value: ClosingPeriodicity): string {
  return (
    CLOSING_PERIODICITIES.find((option) => option.value === value)?.label ??
    value
  );
}
