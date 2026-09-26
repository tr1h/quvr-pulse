// Runs before `npm run dev`: ensures .env exists, waits briefly for PostgreSQL and applies
// migrations. Never fails the dev start — without a database the app runs with in-memory
// fallbacks (no snapshots/watchlist) and says so on /status.
import { existsSync, copyFileSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import net from "node:net";

if (!existsSync(".env")) {
  copyFileSync(".env.example", ".env");
  console.log("[predev] created .env from .env.example");
}

const env = Object.fromEntries(
  readFileSync(".env", "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);

const dbUrl = env.DATABASE_URL;
if (!dbUrl) {
  console.log("[predev] DATABASE_URL empty — skipping migrations");
  process.exit(0);
}

const { hostname, port } = new URL(dbUrl);
const reachable = () =>
  new Promise((resolve) => {
    const s = net.connect({ host: hostname, port: Number(port || 5432) });
    s.setTimeout(1500);
    s.on("connect", () => (s.destroy(), resolve(true)));
    s.on("error", () => resolve(false));
    s.on("timeout", () => (s.destroy(), resolve(false)));
  });

let ok = false;
for (let i = 0; i < 15 && !(ok = await reachable()); i++)
  await new Promise((r) => setTimeout(r, 1000));

if (!ok) {
  console.warn(
    `[predev] PostgreSQL is not reachable at ${hostname}:${port}. Run "docker compose up -d". Starting without database.`,
  );
  process.exit(0);
}
try {
  execSync("npx prisma migrate deploy --schema packages/db/prisma/schema.prisma", {
    stdio: "inherit",
  });
} catch {
  console.warn("[predev] prisma migrate deploy failed — continuing (see output above)");
}
