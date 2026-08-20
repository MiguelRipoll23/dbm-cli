import type { Credentials } from "../core/ports/secret-resolver.js";

const DEFAULT_IDLE_TTL_MS = 30 * 60 * 1000;

type CacheEntry = {
  credentials: Credentials;
  timer: NodeJS.Timeout;
};

// Holds decrypted passwords in memory only, for the lifetime of the daemon
// process — never persisted to disk. Each entry's TTL slides forward on
// every get() so an actively-used connection doesn't expire mid-session.
export class PasswordCache {
  private readonly entries = new Map<string, CacheEntry>();

  constructor(private readonly idleTtlMs = DEFAULT_IDLE_TTL_MS) {}

  get(connectionId: string): Credentials | undefined {
    const entry = this.entries.get(connectionId);
    if (!entry) return undefined;
    entry.timer.refresh();
    return entry.credentials;
  }

  set(connectionId: string, credentials: Credentials): void {
    const existing = this.entries.get(connectionId);
    if (existing) clearTimeout(existing.timer);
    const timer = setTimeout(() => this.entries.delete(connectionId), this.idleTtlMs).unref();
    this.entries.set(connectionId, { credentials, timer });
  }

  get size(): number {
    return this.entries.size;
  }

  clear(): void {
    for (const entry of this.entries.values()) clearTimeout(entry.timer);
    this.entries.clear();
  }
}
