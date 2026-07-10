import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { credentialsEnvelopeSchema } from "./credentials.js";

// The server never decrypts credentials.enc — but this test verifies the
// envelope format documented in the plan is actually round-trippable with
// WebCrypto (the same API the browser uses), and that the schema accepts
// what a real envelope looks like. It also confirms a wrong password fails
// AES-GCM authentication rather than silently producing garbage.
const ITERATIONS = 210_000;

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const baseKey = await webcrypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  return webcrypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function encryptEnvelope(password: string, plaintext: unknown) {
  const salt = webcrypto.getRandomValues(new Uint8Array(16));
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const ciphertext = await webcrypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify(plaintext)));
  return {
    version: 1 as const,
    kdf: { algorithm: "PBKDF2" as const, hash: "SHA-256" as const, iterations: ITERATIONS, salt: Buffer.from(salt).toString("base64") },
    cipher: "AES-GCM" as const,
    iv: Buffer.from(iv).toString("base64"),
    ciphertext: Buffer.from(ciphertext).toString("base64"),
  };
}

async function decryptEnvelope(password: string, envelope: Awaited<ReturnType<typeof encryptEnvelope>>): Promise<unknown> {
  const salt = Buffer.from(envelope.kdf.salt, "base64");
  const iv = Buffer.from(envelope.iv, "base64");
  const key = await deriveKey(password, new Uint8Array(salt));
  const plaintext = await webcrypto.subtle.decrypt({ name: "AES-GCM", iv: new Uint8Array(iv) }, key, new Uint8Array(Buffer.from(envelope.ciphertext, "base64")));
  return JSON.parse(new TextDecoder().decode(plaintext));
}

describe("credentials.enc envelope format", () => {
  it("round-trips through encrypt/decrypt with the correct master password", async () => {
    const plaintext = { "orders-db:development": { username: "app", password: "s3cret" } };
    const envelope = await encryptEnvelope("correct horse battery staple", plaintext);

    connectionsEnvelopeAssertValid(envelope);

    const decrypted = await decryptEnvelope("correct horse battery staple", envelope);
    assert.deepEqual(decrypted, plaintext);
  });

  it("fails AES-GCM authentication with the wrong master password", async () => {
    const envelope = await encryptEnvelope("right-password", { foo: "bar" });
    await assert.rejects(() => decryptEnvelope("wrong-password", envelope));
  });

  function connectionsEnvelopeAssertValid(envelope: unknown): void {
    const parsed = credentialsEnvelopeSchema.parse(envelope);
    assert.equal(parsed.version, 1);
    assert.equal(parsed.cipher, "AES-GCM");
  }
});
