import type { Hono } from "hono";
import type { CredentialStore } from "../../core/ports/credential-store.js";
import { credentialsEnvelopeSchema } from "../schemas/credentials.js";
import { ApiError } from "../errors.js";

// Thin handlers only: the server never decrypts or inspects the envelope
// contents — it stores/returns the opaque blob the browser produces.
export function registerCredentialRoutes(app: Hono, credentialStore: CredentialStore): void {
  app.get("/api/credentials/envelope", async (c) => {
    const raw = await credentialStore.readEnvelope();
    if (raw === undefined) {
      throw new ApiError(404, "NOT_FOUND", "No credentials have been stored yet.");
    }
    // The server never inspects these fields beyond shape; ciphertext stays
    // opaque to it — this is just a pass-through of the stored blob.
    return c.json(JSON.parse(raw), 200);
  });

  app.put("/api/credentials/envelope", async (c) => {
    const parsed = credentialsEnvelopeSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      throw new ApiError(400, "VALIDATION_ERROR", parsed.error.message);
    }
    await credentialStore.writeEnvelope(JSON.stringify(parsed.data));
    return c.body(null, 204);
  });
}
