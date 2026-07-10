import { createRoute, type OpenAPIHono } from "@hono/zod-openapi";
import type { UnlockBroker } from "../unlock-broker.js";
import { credentialResolveSchema, pendingUnlockSchema, unlockRequestIdParam } from "../schemas/credentials.js";
import { ApiError } from "../errors.js";

const pendingUnlockRoute = createRoute({
  method: "get",
  path: "/api/pending-unlock",
  responses: {
    200: { description: "The oldest pending connect request awaiting a credential, if any", content: { "application/json": { schema: pendingUnlockSchema } } },
  },
});

const resolveUnlockRoute = createRoute({
  method: "post",
  path: "/api/unlock-request/{id}/resolve",
  request: {
    params: unlockRequestIdParam,
    body: { content: { "application/json": { schema: credentialResolveSchema } } },
  },
  responses: {
    204: { description: "Credential delivered to the waiting CLI process" },
    404: { description: "No such pending request (already resolved, expired, or never existed)" },
  },
});

// Bridges the browser (which holds the decrypted credential) and the CLI
// process blocked in WebSecretResolver.resolveCredentials — see unlock-broker.ts.
export function registerUnlockRoutes(app: OpenAPIHono, broker: UnlockBroker): void {
  app.openapi(pendingUnlockRoute, async (c) => {
    const pending = broker.peekOldest();
    return c.json(pending ?? null, 200);
  });

  app.openapi(resolveUnlockRoute, async (c) => {
    const { id } = c.req.valid("param");
    const credentials = c.req.valid("json");
    const delivered = broker.resolve(id, credentials);
    if (!delivered) {
      throw new ApiError(404, "NOT_FOUND", "This unlock request is no longer pending (it may have expired).");
    }
    return c.body(null, 204);
  });
}
