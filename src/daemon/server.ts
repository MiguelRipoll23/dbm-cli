import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";
import { serve, type ServerType } from "@hono/node-server";
import type { ConnectionService } from "../core/services/connection-service.js";
import type { CredentialStore } from "../core/ports/credential-store.js";
import { buildApp } from "../web/app.js";
import { PasswordCache } from "../web/password-cache.js";
import { getDaemonPort, getDaemonStateFilePath } from "../config/paths.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// dist/daemon/server.js -> dist/web-ui (the compiled SPA, copied here at build time)
const STATIC_ROOT = path.join(__dirname, "..", "web-ui");

export type DaemonServerHandle = {
  baseUrl: string;
  /** Resolves once a CLI invocation has requested a graceful shutdown (see routes/daemon.ts). */
  whenShutdownRequested: Promise<void>;
  close: () => Promise<void>;
};

// Same Hono app as `dbm web`, bound to a fixed port (instead of an
// ephemeral one) so other CLI invocations can find it, plus the daemon-only
// routes registered via buildApp's `daemon` option. Writes the state file
// (pid/port/token) that daemon-manager.ts reads from other processes.
export async function startDaemonServer(
  connectionService: ConnectionService,
  credentialStore: CredentialStore,
): Promise<DaemonServerHandle> {
  const port = getDaemonPort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const cache = new PasswordCache();
  const startedAt = Date.now();

  let requestShutdown: () => void;
  const whenShutdownRequested = new Promise<void>((resolve) => {
    requestShutdown = resolve;
  });

  const { app, token } = buildApp(connectionService, credentialStore, STATIC_ROOT, () => requestShutdown(), {
    cache,
    startedAt,
    baseUrl,
  });

  const server = await new Promise<ServerType>((resolve, reject) => {
    const s = serve({ fetch: app.fetch, hostname: "127.0.0.1", port }, () => resolve(s));
    s.once("error", (error: NodeJS.ErrnoException) => reject(error));
  });

  // 0600: the file holds the session token that authorizes /api/daemon/*
  // (which resolves decrypted credentials), so no other local user may read it.
  writeFileSync(getDaemonStateFilePath(), JSON.stringify({ pid: process.pid, port, token, startedAt }), {
    encoding: "utf8",
    mode: 0o600,
  });

  return {
    baseUrl,
    whenShutdownRequested,
    close: () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}
