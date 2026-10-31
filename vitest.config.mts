import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  // Em série: cada arquivo sobe um Postgres em WebAssembly, e juntos estouram a memória.
  test: { include: ["tests/**/*.test.ts"], testTimeout: 60_000, hookTimeout: 120_000, maxWorkers: 1, fileParallelism: false },
});
