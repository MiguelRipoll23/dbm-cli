import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve, type ServerType } from "@hono/node-server";
import type { ConnectionService } from "../core/services/connection-service.js";
import type { CredentialStore } from "../core/ports/credential-store.js";
import { buildApp } from "./app.js";
import type { UnlockBroker } from "./unlock-broker.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// dist/web/server.js -> dist/web-ui (the compiled SPA, copied here at build time)
const STATIC_ROOT = path.join(__dirname, "..", "web-ui");

const DEFAULT_PORT = 4319;

export type WebServerHandle = {
  baseUrl: string;
  token: string;
  broker: UnlockBroker;
  /** Resolves once the browser has called POST /api/shutdown (see routes/shutdown.ts). */
  whenShutdownRequested: Promise<void>;
  close: () => Promise<void>;
};

// Tries the default port first (so "dbm-cli web" opens at a predictable URL
// across runs), but falls back to an OS-assigned ephemeral port if it's
// already taken — e.g. a "dbm-cli web" session is already running, or two
// "dbm-cli connect" invocations overlap. Each process gets its own server
// and its own UnlockBroker, so there is no cross-process sharing here;
// falling back just avoids a hard crash on EADDRINUSE.
function listen(app: Parameters<typeof serve>[0]["fetch"], port: number): Promise<ServerType> {
  return new Promise((resolve, reject) => {
    const s = serve({ fetch: app, hostname: "127.0.0.1", port }, () => resolve(s));
    s.once("error", (error: NodeJS.ErrnoException) => {
      reject(error);
    });
  });
}

export async function startWebServer(
  connectionService: ConnectionService,
  credentialStore: CredentialStore,
): Promise<WebServerHandle> {
  let requestShutdown: () => void;
  const whenShutdownRequested = new Promise<void>((resolve) => {
    requestShutdown = resolve;
  });

  const { app, token, broker } = buildApp(connectionService, credentialStore, STATIC_ROOT, () => requestShutdown());

  let server: ServerType;
  try {
    server = await listen(app.fetch, DEFAULT_PORT);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EADDRINUSE") throw error;
    server = await listen(app.fetch, 0);
  }

  const address = server.address();
  const port = typeof address === "object" && address ? address.port : DEFAULT_PORT;
  const baseUrl = `http://127.0.0.1:${port}`;

  return {
    baseUrl,
    token,
    broker,
    whenShutdownRequested,
    close: () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}
