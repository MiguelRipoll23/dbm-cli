import { defineCommand } from "citty";
import consola from "consola";
import type { ConnectionService } from "../core/services/connection-service.js";
import type { CredentialStore } from "../core/ports/credential-store.js";
import { startWebServer } from "../web/server.js";
import { openBrowser } from "../web/open-browser.js";

export function makeWebCommand(connectionService: ConnectionService, credentialStore: CredentialStore) {
  return defineCommand({
    meta: {
      name: "web",
      description:
        "Open the local web UI to unlock and manage connections and credentials. This is a one-off foreground " +
        "session — for the background password-caching daemon used by 'connect', see 'dbm daemon'.",
    },
    async run() {
      const server = await startWebServer(connectionService, credentialStore);
      consola.success(`Web UI running at ${server.baseUrl}`);
      consola.info("Press Ctrl+C to stop.");
      openBrowser(`${server.baseUrl}/?token=${server.token}`);

      await Promise.race([
        new Promise<void>((resolve) => {
          process.on("SIGINT", () => resolve());
          process.on("SIGTERM", () => resolve());
        }),
        server.whenShutdownRequested,
      ]);

      await server.close();
    },
  });
}
