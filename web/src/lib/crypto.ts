import type { CredentialsEnvelope, CredentialsMap } from "@/types/credentials";

// All cryptography happens in the browser via window.crypto.subtle. The
// master password and the derived key must never be sent to the backend or
// persisted to any storage — callers are responsible for keeping the
// resulting CryptoKey in memory only (e.g. React context state).

export const DEFAULT_PBKDF2_ITERATIONS = 210_000;

const PBKDF2_HASH = "SHA-256";
const AES_ALGORITHM = "AES-GCM";
const AES_KEY_LENGTH = 256;
const SALT_LENGTH_BYTES = 16;
const IV_LENGTH_BYTES = 12;

function toBase64(bytes: ArrayBuffer | Uint8Array): string {
  const array = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (const byte of array) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** Cryptographically-secure random bytes. Never use Math.random() for these. */
export function generateRandomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

export function generateSalt(): Uint8Array {
  return generateRandomBytes(SALT_LENGTH_BYTES);
}

export function generateIv(): Uint8Array {
  return generateRandomBytes(IV_LENGTH_BYTES);
}

/** Derives an AES-256-GCM CryptoKey from a master password via PBKDF2. */
export async function deriveKey(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<CryptoKey> {
  const passwordKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt as BufferSource,
      iterations,
      hash: PBKDF2_HASH,
    },
    passwordKey,
    { name: AES_ALGORITHM, length: AES_KEY_LENGTH },
    false,
    ["encrypt", "decrypt"],
  );
}

/**
 * Encrypts a plaintext object into a full envelope, generating a fresh salt
 * and iv. Used both when creating the very first envelope and whenever the
 * credentials map changes (the backend has no partial-update endpoint —
 * the whole envelope is re-encrypted and re-uploaded every time).
 */
export async function encryptEnvelope(
  password: string,
  plaintextObj: CredentialsMap,
  iterations: number = DEFAULT_PBKDF2_ITERATIONS,
): Promise<CredentialsEnvelope> {
  const salt = generateSalt();
  const key = await deriveKey(password, salt, iterations);
  return encryptEnvelopeWithKey(key, salt, iterations, plaintextObj);
}

/**
 * Encrypts using an already-derived key (e.g. the one kept in memory after
 * unlock), but still rotates the IV (mandatory for AES-GCM — never reuse an
 * IV under the same key) and keeps the existing salt/iterations.
 */
export async function encryptEnvelopeWithKey(
  key: CryptoKey,
  salt: Uint8Array,
  iterations: number,
  plaintextObj: CredentialsMap,
): Promise<CredentialsEnvelope> {
  const iv = generateIv();
  const plaintext = new TextEncoder().encode(JSON.stringify(plaintextObj));

  const ciphertext = await crypto.subtle.encrypt(
    { name: AES_ALGORITHM, iv: iv as BufferSource },
    key,
    plaintext,
  );

  return {
    version: 1,
    kdf: {
      algorithm: "PBKDF2",
      hash: PBKDF2_HASH,
      iterations,
      salt: toBase64(salt),
    },
    cipher: AES_ALGORITHM,
    iv: toBase64(iv),
    ciphertext: toBase64(ciphertext),
  };
}

export class InvalidMasterPasswordError extends Error {
  constructor() {
    super("Incorrect master password.");
    this.name = "InvalidMasterPasswordError";
  }
}

/**
 * Derives the key from the envelope's own KDF params + the given password,
 * then decrypts. Throws InvalidMasterPasswordError if the password is wrong
 * (surfaced by the AES-GCM auth tag check failing, i.e. an OperationError) —
 * callers should show a generic "incorrect password" message, no internals.
 */
export async function decryptEnvelope(
  envelope: CredentialsEnvelope,
  password: string,
): Promise<{ key: CryptoKey; salt: Uint8Array; plaintext: CredentialsMap }> {
  const salt = fromBase64(envelope.kdf.salt);
  const iv = fromBase64(envelope.iv);
  const ciphertext = fromBase64(envelope.ciphertext);

  const key = await deriveKey(password, salt, envelope.kdf.iterations);

  try {
    const decrypted = await crypto.subtle.decrypt(
      { name: AES_ALGORITHM, iv: iv as BufferSource },
      key,
      ciphertext as BufferSource,
    );
    const plaintext = JSON.parse(
      new TextDecoder().decode(decrypted),
    ) as CredentialsMap;
    return { key, salt, plaintext };
  } catch {
    // AES-GCM authentication failure (wrong key derived from wrong password)
    // throws a generic DOMException "OperationError" with no useful detail.
    throw new InvalidMasterPasswordError();
  }
}

// The credentials map is keyed by the connection's stable id — this used to
// be `${name}:${environment}`, but that broke whenever a connection was
// renamed (the CLI can't touch the encrypted vault). See the rekey flow in
// vault-context.tsx, which migrates any old-format keys on first unlock.
export function credentialKey(id: string): string {
  return id;
}
