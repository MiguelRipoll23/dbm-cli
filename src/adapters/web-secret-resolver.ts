import type { Connection } from "../core/domain/connection.js";
import type { Credentials, SecretResolver } from "../core/ports/secret-resolver.js";
import type { DaemonManager } from "./daemon-manager.js";
import type { DaemonClient } from "./daemon-client.js";

// Resolves a credential via the background daemon (see daemon-manager.ts),
// starting it on demand if it isn't already running. The daemon owns the
// browser-unlock flow and an in-memory password cache (routes/daemon.ts),
// so repeat calls for the same connection skip opening the browser — this
// adapter never sees the master password or the decrypted envelope itself.
export class WebSecretResolver implements SecretResolver {
  constructor(
    private readonly daemonManager: DaemonManager,
    private readonly daemonClient: DaemonClient,
  ) {}

  async resolveCredentials(connection: Connection): Promise<Credentials> {
    const { baseUrl, token } = await this.daemonManager.ensureStarted();
    return this.daemonClient.resolveCredentials(baseUrl, token, connection);
  }
}
