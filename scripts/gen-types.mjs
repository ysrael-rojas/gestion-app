#!/usr/bin/env node
// Regenera lib/supabase/types.ts de forma segura.
//
// A diferencia de `supabase ... > lib/supabase/types.ts` (que trunca el archivo
// antes de ejecutar el comando), este script escribe en un temporal y solo
// reemplaza el archivo real si supabase terminó bien y la salida no está vacía.
// Si algo falla, se conserva el `types.ts` anterior.
import { execSync } from "node:child_process";
import { existsSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const target = join("lib", "supabase", "types.ts");
const tmp = `${target}.tmp`;

try {
  const output = execSync("supabase gen types typescript --linked", {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });

  if (!output.trim()) {
    throw new Error("la salida de supabase está vacía");
  }

  writeFileSync(tmp, output);
  renameSync(tmp, target);
  console.log(`✔ ${target} actualizado`);
} catch (error) {
  if (existsSync(tmp)) rmSync(tmp);
  console.error("✖ No se regeneraron los tipos; se conserva el archivo anterior.");
  console.error(error.message);
  process.exit(1);
}
