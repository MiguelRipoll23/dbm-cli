import { randomBytes } from "node:crypto";
import path from "node:path";
import { serveStatic } from "@hono/node-server/serve-static";
import { OpenAPIHono } from "@hono/zod-openapi";
import consola from "consola";
import type { ConnectionService } from "../core/services/connection-service.js";
import type { CredentialStore } from "../core/ports/credential-store.js";
import { registerConnectionRoutes } from "./routes/connections.js";
import { registerCredentialRoutes } from "./routes/credentials.js";
import { registerUnlockRoutes } from "./routes/unlock.js";
import { registerShutdownRoutes } from "./routes/shutdown.js";
import { UnlockBroker } from "./unlock-broker.js";
import { ApiError } from "./errors.js";

export type BuiltApp = {
  app: OpenAPIHono;
  token: string;
  broker: UnlockBroker;
};

// Builds the Hono app (routes, OpenAPI doc, auth middleware, error handling)
// without binding to a network port — kept separate from server.ts's
// serve()/serveStatic() wiring so it can be exercised directly in tests via
// app.request(), and so static-file serving (which needs a real dist path)
// stays out of the unit-testable core.
export function buildApp(
  connectionService: ConnectionService,
  credentialStore: CredentialStore,
  staticRoot?: string,
  onShutdownRequest: () => void = () => {},
  rekeyMapPath = "",
): BuiltApp {
  const token = randomBytes(24).toString("base64url");
  const broker = new UnlockBroker();
  const app = new OpenAPIHono();

  // Every /api/* route requires the per-launch session token, except the
  // OpenAPI document itself (harmless to expose, useful for tooling).
  app.use("/api/*", async (c, next) => {
    if (c.req.path === "/api/openapi.json") {
      await next();
      return;
    }
    const provided = c.req.header("x-db-cli-token");
    if (provided !== token) {
      return c.json({ error: { code: "UNAUTHORIZED", message: "Missing or invalid session token." } }, 401);
    }
    await next();
  });

  registerConnectionRoutes(app, connectionService);
  registerCredentialRoutes(app, credentialStore, rekeyMapPath);
  registerUnlockRoutes(app, broker);
  registerShutdownRoutes(app, broker, onShutdownRequest);

  app.doc("/api/openapi.json", {
    openapi: "3.1.0",
    info: { title: "db-cli local API", version: "1" },
  });

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
