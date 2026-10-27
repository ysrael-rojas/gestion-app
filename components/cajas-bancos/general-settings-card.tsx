"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ensureDefaultSettings,
  getAppSettings,
  setAppSetting,
} from "@/lib/caja/caja";
import { CLOSING_PERIODICITIES } from "@/lib/data/cash-options";
import type { ClosingPeriodicity } from "@/components/pagos/types";

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Ocurrió un error inesperado. Intenta nuevamente.";
}

export function GeneralSettingsCard() {
  const [periodicity, setPeriodicity] = useState<ClosingPeriodicity>("DAILY");
  const [rate, setRate] = useState("3.75");
  const [tolerance, setTolerance] = useState("0.50");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let isMounted = true;

    void (async () => {
      try {
        await ensureDefaultSettings();
        const settings = await getAppSettings();

        if (isMounted) {
          const value = settings.default_closing_periodicity;
          if (value === "DAILY" || value === "WEEKLY" || value === "MONTHLY") {
            setPeriodicity(value);
          }
          setRate(settings.pen_usd_rate ?? "3.75");
          setTolerance(settings.cash_difference_tolerance ?? "0.50");
        }
      } catch (error) {
        if (isMounted) {
          toast.error(getErrorMessage(error));
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  async function handleSave() {
    const numericRate = Number(rate);
    const numericTolerance = Number(tolerance);

    if (!Number.isFinite(numericRate) || numericRate <= 0) {
      toast.error("El tipo de cambio debe ser mayor a 0.");
      return;
    }

    if (!Number.isFinite(numericTolerance) || numericTolerance < 0) {
      toast.error("La tolerancia de diferencia debe ser mayor o igual a 0.");
      return;
    }

    setIsSaving(true);
    try {
      await setAppSetting("default_closing_periodicity", periodicity);
      await setAppSetting("pen_usd_rate", String(numericRate));
      await setAppSetting(
        "cash_difference_tolerance",
        numericTolerance.toFixed(2)
      );
      toast.success("Configuración guardada");
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card className="bg-muted/30 ring-0">
      <CardHeader>
        <CardTitle>Configuración general</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="defaultPeriodicity">
            Periodicidad de cierre predeterminada
          </Label>
          <Select
            value={periodicity}
            items={CLOSING_PERIODICITIES}
            onValueChange={(value) => {
              if (value === "DAILY" || value === "WEEKLY" || value === "MONTHLY") {
                setPeriodicity(value);
              }
            }}
          >
            <SelectTrigger
              id="defaultPeriodicity"
              className="w-full sm:w-64"
              disabled={isLoading}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CLOSING_PERIODICITIES.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Se usa en las cuentas que no tengan su propia periodicidad.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="penUsdRate">Tipo de cambio PEN/USD</Label>
          <Input
            id="penUsdRate"
            type="number"
            step="0.0001"
            min="0"
            className="w-full sm:w-64"
            value={rate}
            onChange={(event) => setRate(event.target.value)}
            disabled={isLoading}
          />
          <p className="text-xs text-muted-foreground">
            Se usa para consolidar a soles las cuentas en otra moneda.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cashDifferenceTolerance">
            Tolerancia de diferencia al cerrar (S/)
          </Label>
          <Input
            id="cashDifferenceTolerance"
            type="number"
            step="0.01"
            min="0"
            className="w-full sm:w-64"
            value={tolerance}
            onChange={(event) => setTolerance(event.target.value)}
            disabled={isLoading}
          />
          <p className="text-xs text-muted-foreground">
            Diferencias de redondeo dentro de este margen no exigen motivo; por
            encima, el cierre pide una explicación escrita.
          </p>
        </div>

        <div>
          <Button onClick={() => void handleSave()} disabled={isSaving || isLoading}>
            Guardar configuración
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
