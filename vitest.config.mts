import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
export default defineConfig({ resolve: {alias: {"@":fileURLToPath(new URL("./src", import.meta.url))}}, test: { environment:"node", include:["tests/backend/**/*.test.ts"], exclude:["tests/backend/database.test.ts"] } });
