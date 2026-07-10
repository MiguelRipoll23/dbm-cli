import type { Connection, ConnectionUpdate } from "@/types/connection";
import type { CredentialsEnvelope, PendingUnlock } from "@/types/credentials";

// Simple module-level token holder. The token itself is not a secret in the
// same sense as the master password: it's a per-launch session credential
// handed to the SPA via the URL query string by the CLI that opened the
// browser, scoped to this one local server instance. Keeping it as a plain
// module variable (rather than routing every fetch through React context)
// is a pragmatic tradeoff — it never touches persistent storage and is only
// ever set once, at startup, from AppTokenProvider.
let sessionToken: string | null = null;

export function setApiToken(token: string): void {
  sessionToken = token;
}

export function getApiToken(): string | null {
  return sessionToken;
}

export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.code = code;
  }
}

async function request<T>(
  path: string,
  init?: RequestInit,
): Promise<T | undefined> {
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");
  if (sessionToken) {
    headers.set("x-db-cli-token", sessionToken);
  }

  const response = await fetch(path, { ...init, headers });

  if (response.status === 204) {
    return undefined;
  }

  if (!response.ok) {
    let code = "UNKNOWN_ERROR";
    let message = `Request failed with status ${response.status}`;
    try {
      const body = (await response.json()) as { error?: { code?: string; message?: string } };
      if (body?.error?.code) code = body.error.code;
      if (body?.error?.message) message = body.error.message;
    } catch {
      // Response body wasn't JSON (or was empty) — fall back to the generic message.
    }
    throw new ApiRequestError(response.status, code, message);
  }

  const text = await response.text();
  return text ? (JSON.parse(text) as T) : undefined;
}

export const api = {
  listConnections: () => request<Connection[]>("/api/connections").then((r) => r ?? []),

  createConnection: (connection: Omit<Connection, "id">) =>
    request<Connection>("/api/connections", {
      method: "POST",
      body: JSON.stringify(connection),
    }),

  updateConnection: (id: string, update: ConnectionUpdate) =>
    request<Connection>(`/api/connections/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(update),
    }),

  deleteConnection: (id: string) =>
    request<void>(`/api/connections/${encodeURIComponent(id)}`, { method: "DELETE" }),

  getCredentialRekeyMap: () =>
    request<Record<string, string>>("/api/credentials/rekey-map").then((r) => r ?? {}),

  getCredentialsEnvelope: async (): Promise<CredentialsEnvelope | null> => {
    try {
      const envelope = await request<CredentialsEnvelope>("/api/credentials/envelope");
      return envelope ?? null;
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 404) {
        return null;
      }
      throw error;
    }
  },

  putCredentialsEnvelope: (envelope: CredentialsEnvelope) =>
    request<void>("/api/credentials/envelope", {
      method: "PUT",
      body: JSON.stringify(envelope),
    }),

  getPendingUnlock: () =>
    request<PendingUnlock>("/api/pending-unlock").then((r) => r ?? null),

  resolveUnlockRequest: (id: string, username: string, password: string) =>
    request<void>(`/api/unlock-request/${encodeURIComponent(id)}/resolve`, {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),

  shutdown: () => request<void>("/api/shutdown", { method: "POST" }),
};
