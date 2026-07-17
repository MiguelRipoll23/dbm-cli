// Stores the opaque, encrypted credentials blob (credentials.enc) on disk.
// This port intentionally knows nothing about the master password or the
// plaintext credentials — decryption happens exclusively in the browser.
export interface CredentialStore {
  /** Raw JSON contents of the encrypted envelope, or undefined if it doesn't exist yet. */
  readEnvelope(): Promise<string | undefined>;
  /** Persists the (already re-encrypted) envelope JSON atomically. */
  writeEnvelope(envelopeJson: string): Promise<void>;
  exists(): Promise<boolean>;
}
