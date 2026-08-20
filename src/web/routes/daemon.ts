import type { Hono } from "hono";
import consola from "consola";
import { connectionSchema } from "../../core/domain/connection.js";
import type { UnlockBroker } from "../unlock-broker.js";
import type { PasswordCache } from "../password-cache.js";
import { openBrowser } from "../open-browser.js";
import { credentialsPrimeSchema } from "../schemas/credentials.js";
import { ApiError } from "../errors.js";

export type DaemonRouteOptions = {
  baseUrl: string;
  token: string;
  startedAt: number;
};

// Routes that only exist when the app is running as the background daemon
// (see app.ts's `daemon` option): resolving/caching decrypted passwords
// across CLI invocations, health-checking, and a hard shutdown distinct from
// the browser-facing /api/shutdown (which must not kill the daemon).
export function registerDaemonRoutes(
  app: Hono,
  broker: UnlockBroker,
  cache: PasswordCache,
  options: DaemonRouteOptions,
  onShutdownRequest: () => void,
): void {
  app.get("/api/daemon/health", (c) =>
    c.json({ pid: process.pid, uptimeMs: Date.now() - options.startedAt, cachedCount: cache.size }, 200),
  );

  app.post("/api/daemon/credentials/prime", async (c) => {
    const parsed = credentialsPrimeSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      throw new ApiError(400, "VALIDATION_ERROR", parsed.error.message);
    }
    // Authoritative: the browser always sends the whole decrypted vault, so
    // mirror it exactly — clearing first drops credentials for connections
    // deleted since the last prime (otherwise they'd linger until their TTL).
    cache.clear();
    for (const [connectionId, credentials] of Object.entries(parsed.data)) {
      cache.set(connectionId, credentials);
    }
    consola.info(`Primed password cache with ${Object.keys(parsed.data).length} credential(s).`);
    return c.json({ cachedCount: cache.size }, 200);
  });

  app.post("/api/daemon/credentials/resolve", async (c) => {
    const parsed = connectionSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      throw new ApiError(400, "VALIDATION_ERROR", parsed.error.message);
    }
    const connection = parsed.data;

    const cached = cache.get(connection.id);
    if (cached) return c.json(cached, 200);

    const { id, promise } = broker.request(connection);
    consola.info(`Waiting for master password in the browser — opening ${options.baseUrl} ...`);
    openBrowser(`${options.baseUrl}/unlock/${id}?token=${options.token}`);

    try {
      const credentials = await promise;
      cache.set(connection.id, credentials);
      return c.json(credentials, 200);
    } catch (error) {
      throw new ApiError(408, "UNLOCK_TIMEOUT", error instanceof Error ? error.message : String(error));
    }
  });

  app.post("/api/daemon/shutdown", async (c) => {
    cache.clear();
    // Respond before tearing down the HTTP server so the caller's fetch
    // resolves cleanly instead of racing the socket closing underneath it.
    setImmediate(() => onShutdownRequest());
    return c.body(null, 204);
  });
}
