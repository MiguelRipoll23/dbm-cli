export type CredentialsEnvelope = {
  version: 1;
  kdf: {
    algorithm: "PBKDF2";
    hash: "SHA-256";
    iterations: number;
    salt: string;
  };
  cipher: "AES-GCM";
  iv: string;
  ciphertext: string;
};

export type CredentialEntry = {
  username: string;
  password: string;
};

// Decrypted plaintext shape: a map keyed by the connection's stable id.
export type CredentialsMap = Record<string, CredentialEntry>;

export type PendingUnlock = {
  id: string;
  connectionId: string;
  name: string;
  environment: string;
} | null;
