import { randomUUID } from "node:crypto";
import type { Connection } from "../core/domain/connection.js";
import type { Credentials } from "../core/ports/secret-resolver.js";

export type PendingUnlock = {
  id: string;
  connectionId: string;
  name: string;
  environment: string;
};

type PendingEntry = {
  connectionId: string;
  name: string;
  environment: string;
  resolve: (credentials: Credentials) => void;
  reject: (error: Error) => void;
};

// In-memory link between WebSecretResolver (which is awaiting a credential
// for a specific name:environment) and the HTTP routes the browser calls to
// deliver it. Nothing here ever touches disk — a page refresh or process
// restart simply loses in-flight requests, which is the correct behavior
// for a local unlock flow.
export class UnlockBroker {
  private readonly pending = new Map<string, PendingEntry>();

  /** Registers a pending request and returns a promise that resolves once the browser delivers credentials. */
  request(connection: Connection, timeoutMs = 5 * 60 * 1000): { id: string; promise: Promise<Credentials> } {
    const id = randomUUID();
    const promise = new Promise<Credentials>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("Unlock request timed out — no response from the web UI."));
      }, timeoutMs);

      this.pending.set(id, {
        connectionId: connection.id,
        name: connection.name,
        environment: connection.environment,
        resolve: (credentials) => {
          clearTimeout(timer);
          resolve(credentials);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
    });
    return { id, promise };
  }

  /** Called by the /api/unlock-request/:id/resolve route once the browser has decrypted the credential. */
  resolve(id: string, credentials: Credentials): boolean {
    const entry = this.pending.get(id);
    if (!entry) return false;
    this.pending.delete(id);
    entry.resolve(credentials);
    return true;
  }

  reject(id: string, message: string): boolean {
    const entry = this.pending.get(id);
    if (!entry) return false;
    this.pending.delete(id);
    entry.reject(new Error(message));
    return true;
  }

  /** Rejects every pending request (e.g. the user closed the web UI while a CLI process was waiting). */
  rejectAll(message: string): void {
    for (const entry of this.pending.values()) {
      entry.reject(new Error(message));
    }
    this.pending.clear();
  }

  /** The oldest pending request, surfaced to the browser via GET /api/pending-unlock. */
  peekOldest(): PendingUnlock | undefined {
    const first = this.pending.entries().next();
    if (first.done) return undefined;
    const [id, entry] = first.value;
    return { id, connectionId: entry.connectionId, name: entry.name, environment: entry.environment };
  }
}
