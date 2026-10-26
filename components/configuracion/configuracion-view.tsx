"use client";

import { useState } from "react";

import { SeriesView } from "@/components/configuracion/series-view";
import { Button } from "@/components/ui/button";

type ConfigTab = "series";

const TABS: { value: ConfigTab; label: string }[] = [
  { value: "series", label: "Series de comprobantes" },
];

export function ConfiguracionView() {
  const [tab, setTab] = useState<ConfigTab>("series");

  return (
    <div className="container mx-auto flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Configuración</h1>
        <p className="text-sm text-muted-foreground">
          Administra la numeración de tus comprobantes de venta.
        </p>
      </div>

      <div className="flex flex-wrap gap-1">
        {TABS.map((item) => (
          <Button
            key={item.value}
            variant={tab === item.value ? "default" : "ghost"}
            size="sm"
            onClick={() => setTab(item.value)}
          >
            {item.label}
          </Button>
        ))}
      </div>

      {tab === "series" ? <SeriesView /> : null}
    </div>
  );
}
