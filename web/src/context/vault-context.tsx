import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { decryptEnvelope, encryptEnvelope, encryptEnvelopeWithKey } from "@/lib/crypto";
import { api } from "@/lib/api";
import type { CredentialsMap } from "@/types/credentials";

type UnlockedVault = {
  key: CryptoKey;
  salt: Uint8Array;
  iterations: number;
  credentials: CredentialsMap;
};

type VaultContextValue = {
  vault: UnlockedVault | null;
  /** Populated once, right after a successful unlock or first-time creation. */
  unlock: (vault: UnlockedVault) => void;
  lock: () => void;
  /**
   * Re-encrypts the whole envelope with the given updated credentials map
   * and persists it via PUT /api/credentials/envelope — the backend has no
   * partial-update endpoint, so every credential change re-uploads the lot.
   */
  persistCredentials: (nextCredentials: CredentialsMap) => Promise<void>;
  /**
   * Verifies currentPassword against the stored envelope, then re-encrypts
   * the whole vault under newPassword (fresh salt) and persists it. Throws
   * InvalidMasterPasswordError if currentPassword is wrong.
   */
  changeMasterPassword: (currentPassword: string, newPassword: string) => Promise<void>;
};

const VaultContext = createContext<VaultContextValue | null>(null);

/**
 * Holds the derived AES-256-GCM CryptoKey and the decrypted credentials map
 * in memory only (component state) for the lifetime of the tab. Never
 * written to localStorage/sessionStorage/cookies — the whole point of this
 * context is to be the sole place the decrypted secrets live client-side.
 */
export function VaultProvider({ children }: { children: ReactNode }) {
  const [vault, setVault] = useState<UnlockedVault | null>(null);

  const unlock = useCallback((next: UnlockedVault) => {
    setVault(next);
  }, []);

  const lock = useCallback(() => {
    setVault(null);
  }, []);

  const persistCredentials = useCallback(
    async (nextCredentials: CredentialsMap) => {
      if (!vault) {
        throw new Error("Vault is locked; cannot persist credentials.");
      }
      const envelope = await encryptEnvelopeWithKey(
        vault.key,
        vault.salt,
        vault.iterations,
        nextCredentials,
      );
      await api.putCredentialsEnvelope(envelope);
      setVault({ ...vault, credentials: nextCredentials });
    },
    [vault],
  );

  const changeMasterPassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      if (!vault) {
        throw new Error("Vault is locked; cannot change master password.");
      }
      const envelope = await api.getCredentialsEnvelope();
      if (!envelope) {
        throw new Error("No credentials vault found.");
      }
      // Throws InvalidMasterPasswordError if currentPassword is wrong.
      await decryptEnvelope(envelope, currentPassword);

      const nextEnvelope = await encryptEnvelope(newPassword, vault.credentials);
      await api.putCredentialsEnvelope(nextEnvelope);
      const { key } = await decryptEnvelope(nextEnvelope, newPassword);
      const saltBytes = Uint8Array.from(atob(nextEnvelope.kdf.salt), (c) => c.charCodeAt(0));
      setVault({ key, salt: saltBytes, iterations: nextEnvelope.kdf.iterations, credentials: vault.credentials });
    },
    [vault],
  );

  const value = useMemo(
    () => ({ vault, unlock, lock, persistCredentials, changeMasterPassword }),
    [vault, unlock, lock, persistCredentials, changeMasterPassword],
  );

  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>;
}

export function useVault(): VaultContextValue {
  const ctx = useContext(VaultContext);
  if (!ctx) {
    throw new Error("useVault must be used within a VaultProvider");
  }
  return ctx;
}
