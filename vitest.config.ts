import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    globals: true,
    // Integration tests live in `tests/integration/` and run via the separate
    // `vitest.integration.config.ts` config (Node environment + Prisma).
    exclude: ["**/node_modules/**", "**/dist/**", "tests/integration/**", "tests/e2e/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
