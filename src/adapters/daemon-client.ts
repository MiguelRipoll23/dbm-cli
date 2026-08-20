import type { Connection } from "../core/domain/connection.js";
import type { Credentials } from "../core/ports/secret-resolver.js";

// Talks to the background daemon (see daemon-manager.ts) over its fixed
// loopback port to resolve a decrypted credential, using its in-memory cache
// when possible instead of opening the browser every time. No client-side
// timeout here — resolving legitimately blocks up to the daemon's 5-minute
// unlock-request timeout while the browser is open.
export class DaemonClient {
  async resolveCredentials(baseUrl: string, token: string, connection: Connection): Promise<Credentials> {
    const response = await fetch(`${baseUrl}/api/daemon/credentials/resolve`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-dbm-cli-token": token },
      body: JSON.stringify(connection),
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => undefined)) as { error?: { message?: string } } | undefined;
      throw new Error(body?.error?.message ?? `Daemon returned ${response.status} resolving credentials.`);
    }

    return (await response.json()) as Credentials;
  }

  // Mirrors the whole decrypted vault into the daemon's cache. Used by the
  // foreground "dbm web" server to forward the SPA's prime so an edit there
  // reaches the daemon that "dbm connect" reads from.
  async primeCache(baseUrl: string, token: string, credentials: Record<string, Credentials>): Promise<void> {
    const response = await fetch(`${baseUrl}/api/daemon/credentials/prime`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-dbm-cli-token": token },
      body: JSON.stringify(credentials),
      signal: AbortSignal.timeout(2000),
    });
    if (!response.ok) {
      throw new Error(`Daemon returned ${response.status} priming cache.`);
    }
  }
}
