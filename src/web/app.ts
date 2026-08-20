import { randomBytes } from "node:crypto";
import path from "node:path";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import consola from "consola";
import type { ConnectionService } from "../core/services/connection-service.js";
import type { CredentialStore } from "../core/ports/credential-store.js";
import { registerConnectionRoutes } from "./routes/connections.js";
import { registerCredentialRoutes } from "./routes/credentials.js";
import { registerUnlockRoutes } from "./routes/unlock.js";
import { registerShutdownRoutes } from "./routes/shutdown.js";
import { registerDaemonRoutes } from "./routes/daemon.js";
import { UnlockBroker } from "./unlock-broker.js";
import { ApiError } from "./errors.js";
import { credentialsPrimeSchema } from "./schemas/credentials.js";
import type { z } from "zod";
import type { PasswordCache } from "./password-cache.js";

export type PrimePayload = z.infer<typeof credentialsPrimeSchema>;

export type BuiltApp = {
  app: Hono;
  token: string;
  broker: UnlockBroker;
};

// Present only when the app is being built for the background daemon
// (see daemon/server.ts) — registers the daemon-only routes and neutralizes
// the browser-facing /api/shutdown so a stray tab can't kill the daemon.
export type DaemonOptions = {
  cache: PasswordCache;
  startedAt: number;
  baseUrl: string;
};

// Builds the Hono app (routes, auth middleware, error handling) without
// binding to a network port — kept separate from server.ts's
// serve()/serveStatic() wiring so it can be exercised directly in tests via
// app.request(), and so static-file serving (which needs a real dist path)
// stays out of the unit-testable core.
export function buildApp(
  connectionService: ConnectionService,
  credentialStore: CredentialStore,
  staticRoot?: string,
  onShutdownRequest: () => void = () => {},
  daemon?: DaemonOptions,
  onPrime?: (credentials: PrimePayload) => Promise<void>,
): BuiltApp {
  const token = randomBytes(24).toString("base64url");
  const broker = new UnlockBroker();
  const app = new Hono();

  // Every /api/* route requires the per-launch session token.
  app.use("/api/*", async (c, next) => {
    const provided = c.req.header("x-dbm-cli-token");
    if (provided !== token) {
      return c.json({ error: { code: "UNAUTHORIZED", message: "Missing or invalid session token." } }, 401);
    }
    await next();
  });

  registerConnectionRoutes(app, connectionService);
  registerCredentialRoutes(app, credentialStore);
  registerUnlockRoutes(app, broker);
  registerShutdownRoutes(app, broker, daemon ? () => {} : onShutdownRequest, !daemon);
  if (daemon) {
    registerDaemonRoutes(app, broker, daemon.cache, { baseUrl: daemon.baseUrl, token, startedAt: daemon.startedAt }, onShutdownRequest);
  } else if (onPrime) {
    // Foreground "dbm web" has no cache of its own, but a credential edited
    // here must still reach a running daemon's cache — otherwise "dbm connect"
    // keeps serving the stale password until its TTL. Forward the same
    // /api/daemon/credentials/prime the SPA calls after every unlock/edit; the
    // forwarder no-ops when no daemon is running.
    app.post("/api/daemon/credentials/prime", async (c) => {
      const parsed = credentialsPrimeSchema.safeParse(await c.req.json());
      if (!parsed.success) {
        throw new ApiError(400, "VALIDATION_ERROR", parsed.error.message);
      }
      await onPrime(parsed.data);
      return c.body(null, 204);
    });
  }

  // Centralized error handling: ApiError carries an explicit status; anything
  // else (including zod validation failures surfaced by Hono) becomes a 500
  // with a generic message — never leaking internals to the browser.
  app.onError((error, c) => {
    if (error instanceof ApiError) {
      return c.json({ error: { code: error.code, message: error.message } }, error.status);
    }
    consola.error(error);
    return c.json({ error: { code: "INTERNAL_ERROR", message: "Unexpected server error." } }, 500);
  });

  if (staticRoot) {
    app.use("*", serveStatic({ root: staticRoot }));
    app.get("*", serveStatic({ path: path.join(staticRoot, "index.html") }));
  }

  return { app, token, broker };
}
