import fs from "node:fs/promises";
import { createRoute, z, type OpenAPIHono } from "@hono/zod-openapi";
import type { CredentialStore } from "../../core/ports/credential-store.js";
import { credentialsEnvelopeSchema } from "../schemas/credentials.js";
import { errorResponseSchema } from "../schemas/connection.js";
import { ApiError } from "../errors.js";

const getEnvelopeRoute = createRoute({
  method: "get",
  path: "/api/credentials/envelope",
  responses: {
    200: { description: "The encrypted credentials envelope", content: { "application/json": { schema: credentialsEnvelopeSchema } } },
    404: { description: "No credentials stored yet", content: { "application/json": { schema: errorResponseSchema } } },
  },
});

const putEnvelopeRoute = createRoute({
  method: "put",
  path: "/api/credentials/envelope",
  request: {
    body: { content: { "application/json": { schema: credentialsEnvelopeSchema } } },
  },
  responses: {
    204: { description: "Envelope stored" },
  },
});

const rekeyMapSchema = z.record(z.string(), z.uuid()).openapi("CredentialRekeyMap");

const getRekeyMapRoute = createRoute({
  method: "get",
  path: "/api/credentials/rekey-map",
  responses: {
    200: {
      description:
        "One-time map of legacy \"name:environment\" credential keys to their new connection id, produced by the JSON-to-SQLite migration. Empty once consumed.",
      content: { "application/json": { schema: rekeyMapSchema } },
    },
  },
});

// Thin handlers only: the server never decrypts or inspects the envelope
// contents — it stores/returns the opaque blob the browser produces.
export function registerCredentialRoutes(app: OpenAPIHono, credentialStore: CredentialStore, rekeyMapPath: string): void {
  app.openapi(getEnvelopeRoute, async (c) => {
    const raw = await credentialStore.readEnvelope();
    if (raw === undefined) {
      throw new ApiError(404, "NOT_FOUND", "No credentials have been stored yet.");
    }
    // Parsed only to satisfy Hono's typed json() response — the server never
    // inspects these fields beyond shape; ciphertext stays opaque to it.
    return c.json(JSON.parse(raw) as z.infer<typeof credentialsEnvelopeSchema>, 200);
  });

  app.openapi(putEnvelopeRoute, async (c) => {
    const body = c.req.valid("json");
    await credentialStore.writeEnvelope(JSON.stringify(body));
    return c.body(null, 204);
  });

  // Consumed once by the web UI right after unlocking: it re-keys any
  // vault entries still under the old "name:environment" key to the
  // connection's stable id, then this file is deleted so the map is only
  // ever served once (subsequent calls return {}).
  app.openapi(getRekeyMapRoute, async (c) => {
    let map: Record<string, string> = {};
    try {
      map = JSON.parse(await fs.readFile(rekeyMapPath, "utf-8")) as Record<string, string>;
      await fs.rm(rekeyMapPath);
    } catch {
      // No pending rekey map — nothing to do, this is the common case.
    }
    return c.json(map, 200);
  });
}
