import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["tests/unit/**/*.test.ts", "tests/components/**/*.test.tsx"],
    exclude: ["node_modules", ".next", "tests/e2e/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      include: [
        "lib/pagos/**/*.ts",
        "lib/comprobantes/**/*.ts",
        "lib/schemas/**/*.ts",
        "lib/ventas/**/*.ts",
        "lib/clientes/**/*.ts",
      ],
      exclude: ["**/*.d.ts", "**/*.test.ts", "**/*.test.tsx"],
    },
  },
});
