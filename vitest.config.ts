import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    fileParallelism: false,
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    setupFiles: ["./vitest.setup.ts"],
    hookTimeout: 60000,
    testTimeout: 60000,
  },
  resolve: {
    alias: {
      "@src": path.resolve(__dirname, "src"),
      "@": path.resolve(__dirname, "."),
      "server-only": path.resolve(__dirname, "vitest.empty.js"),
    },
  },
});

