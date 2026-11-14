import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/backend/database.test.ts"],
    fileParallelism: false,
  },
});
