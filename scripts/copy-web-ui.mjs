// Copies the pre-built SPA (web/dist, committed to the repo) into
// dist/web-ui, where src/web/server.ts expects to find it at runtime.
// Kept as a plain Node script (no extra dependency) so it works identically
// on Windows/macOS/Linux without relying on shell-specific cp/xcopy flags.
import { cpSync, existsSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = path.join(rootDir, "web", "dist");
const destination = path.join(rootDir, "dist", "web-ui");

if (!existsSync(source)) {
  console.error(
    `error: ${source} does not exist. Build the web UI first: (cd web && pnpm install && pnpm build)`,
  );
  process.exit(1);
}

rmSync(destination, { recursive: true, force: true });
cpSync(source, destination, { recursive: true });
console.log(`Copied ${source} -> ${destination}`);
