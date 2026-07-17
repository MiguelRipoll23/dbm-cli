import type { Hono } from "hono";
import type { UnlockBroker } from "../unlock-broker.js";
import { credentialResolveSchema } from "../schemas/credentials.js";
import { ApiError } from "../errors.js";

// Bridges the browser (which holds the decrypted credential) and the CLI
// process blocked in WebSecretResolver.resolveCredentials — see unlock-broker.ts.
export function registerUnlockRoutes(app: Hono, broker: UnlockBroker): void {
  app.get("/api/pending-unlock", async (c) => {
    const pending = broker.peekOldest();
    return c.json(pending ?? null, 200);
  });

  app.post("/api/unlock-request/:id/resolve", async (c) => {
    const id = c.req.param("id");
    const parsed = credentialResolveSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      throw new ApiError(400, "VALIDATION_ERROR", parsed.error.message);
    }
    const delivered = broker.resolve(id, parsed.data);
    if (!delivered) {
      throw new ApiError(404, "NOT_FOUND", "This unlock request is no longer pending (it may have expired).");
    }
    return c.body(null, 204);
  });
}
