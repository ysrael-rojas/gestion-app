"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { CajasBancosListadoView } from "@/components/cajas-bancos/cajas-bancos-listado-view";
import { CategoriasCard } from "@/components/cajas-bancos/categorias-card";
import { GeneralSettingsCard } from "@/components/cajas-bancos/general-settings-card";
import { MetodosPagoCard } from "@/components/cajas-bancos/metodos-pago-card";

type ConfigTab = "cuentas" | "metodos" | "categorias" | "general";

const TABS: { value: ConfigTab; label: string }[] = [
  { value: "cuentas", label: "Cuentas" },
  { value: "metodos", label: "Métodos de pago" },
  { value: "categorias", label: "Categorías" },
  { value: "general", label: "General" },
];

export function ConfiguracionView() {
  const [tab, setTab] = useState<ConfigTab>("cuentas");

  return (
    <div className="container mx-auto flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Configuración de caja y bancos</h1>
        <p className="text-sm text-muted-foreground">
          Administra cuentas, métodos de pago, categorías y ajustes generales.
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

      {tab === "cuentas" ? <CajasBancosListadoView /> : null}
      {tab === "metodos" ? <MetodosPagoCard /> : null}
      {tab === "categorias" ? <CategoriasCard /> : null}
      {tab === "general" ? <GeneralSettingsCard /> : null}
    </div>
  );
}
