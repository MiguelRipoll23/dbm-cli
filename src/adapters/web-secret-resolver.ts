import consola from "consola";
import type { Connection } from "../core/domain/connection.js";
import type { Credentials, SecretResolver } from "../core/ports/secret-resolver.js";
import type { ConnectionService } from "../core/services/connection-service.js";
import type { CredentialStore } from "../core/ports/credential-store.js";
import { startWebServer, type WebServerHandle } from "../web/server.js";
import { openBrowser } from "../web/open-browser.js";

// Resolves a single credential by waiting on the browser to decrypt it.
// The master password and every other credential in credentials.enc stay
// in the browser tab — this adapter (running in the CLI process the AI
// agent drives) only ever sees the one {username, password} pair the
// browser hands back for this specific name:environment, and immediately
// passes it on to ConnectService -> ClientLauncher without logging it.
export class WebSecretResolver implements SecretResolver {
  private serverHandle: WebServerHandle | undefined;

  constructor(
    private readonly connectionService: ConnectionService,
    private readonly credentialStore: CredentialStore,
  ) {}

  private async ensureServer(): Promise<WebServerHandle> {
    if (!this.serverHandle) {
      this.serverHandle = await startWebServer(this.connectionService, this.credentialStore);
    }
    return this.serverHandle;
  }

  async resolveCredentials(connection: Connection): Promise<Credentials> {
    const server = await this.ensureServer();
    const { id, promise } = server.broker.request(connection);

    consola.info(`Waiting for master password in the browser — opening ${server.baseUrl} ...`);
    openBrowser(`${server.baseUrl}/unlock/${id}?token=${server.token}`);

    return promise;
  }
}
