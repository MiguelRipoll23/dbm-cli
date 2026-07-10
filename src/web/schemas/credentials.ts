import { z } from "zod";

// Mirrors the credentials.enc envelope format documented in the plan.
// The server never parses "ciphertext" — it treats it as an opaque blob.
// This schema only exists to validate shape on the wire (base64 strings,
// required fields), not to decrypt anything.
export const credentialsEnvelopeSchema = z.object({
  version: z.literal(1),
  kdf: z.object({
    algorithm: z.literal("PBKDF2"),
    hash: z.literal("SHA-256"),
    iterations: z.number().int().positive(),
    salt: z.string(), // base64
  }),
  cipher: z.literal("AES-GCM"),
  iv: z.string(), // base64
  ciphertext: z.string(), // base64
});

export const credentialResolveSchema = z.object({
  username: z.string(),
  password: z.string(),
});

export const pendingUnlockSchema = z
  .object({
    id: z.string(),
    connectionId: z.string(),
    name: z.string(),
    environment: z.string(),
  })
  .nullable();

export const unlockRequestIdParam = z.object({
  id: z.string(),
});
