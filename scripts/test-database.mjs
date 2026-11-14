import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createServer } from "node:net";
const bin = process.env.PG_BIN || "/opt/homebrew/opt/postgresql@18/bin";
mkdirSync(".local", { recursive: true });
const dir = mkdtempSync(join(process.cwd(), ".local", "test-pg-"));
const server = createServer();
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
await new Promise((resolve) => server.close(resolve));
function run(command, args, options = {}) {
  const r = spawnSync(command, args, {
    stdio: "pipe",
    encoding: "utf8",
    ...options,
  });
  if (r.status !== 0)
    throw new Error(
      r.stderr || r.stdout || r.error?.message || `${command} failed`,
    );
  return r;
}
let started = false;
let result = 1;
try {
  run(join(bin, "initdb"), [
    "-D",
    join(dir, "data"),
    "-A",
    "trust",
    "--no-locale",
  ]);
  run(join(bin, "pg_ctl"), [
    "-D",
    join(dir, "data"),
    "-l",
    join(dir, "postgres.log"),
    "-o",
    `-p ${port} -h 127.0.0.1 -k ${dir}`,
    "start",
  ]);
  started = true;
  run(join(bin, "createdb"), [
    "-h",
    "127.0.0.1",
    "-p",
    String(port),
    "gannyland_test",
  ]);
  run(join(bin, "psql"), [
    "-h",
    "127.0.0.1",
    "-p",
    String(port),
    "-d",
    "gannyland_test",
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    "create role anon; create role authenticated; create role service_role bypassrls;",
  ]);
  const r = spawnSync(
    "npx",
    ["vitest", "run", "--config", "vitest.integration.config.mts"],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        TEST_DATABASE_URL: `postgresql://127.0.0.1:${port}/gannyland_test`,
      },
    },
  );
  result = r.status ?? 1;
} catch (error) {
  console.error(error.message);
  console.error("Install PostgreSQL or set PG_BIN to its bin directory.");
} finally {
  if (started)
    spawnSync(
      join(bin, "pg_ctl"),
      ["-D", join(dir, "data"), "-m", "fast", "stop"],
      { stdio: "ignore" },
    );
  rmSync(dir, { recursive: true, force: true });
}
process.exitCode = result;
