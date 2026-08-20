#!/usr/bin/env node
import { unlinkSync } from "node:fs";
import consola from "consola";
import { SqliteConnectionRepository } from "../adapters/sqlite-connection-repository.js";
import { FileCredentialStore } from "../adapters/file-credential-store.js";
import { ConnectionService } from "../core/services/connection-service.js";
import { getConnectionsDbPath, getCredentialsFilePath, getDaemonStateFilePath } from "../config/paths.js";
import { startDaemonServer } from "./server.js";

// Entry point for the detached background daemon process — spawned by
// DaemonManager.ensureStarted() (src/adapters/daemon-manager.ts). Never
// exits on its own; only stops via /api/daemon/shutdown (see routes/daemon.ts).
async function main(): Promise<void> {
  const repository = new SqliteConnectionRepository(getConnectionsDbPath());
  const connectionService = new ConnectionService(repository);
  const credentialStore = new FileCredentialStore(getCredentialsFilePath());

  const server = await startDaemonServer(connectionService, credentialStore);

  const removeStateFile = () => {
    try {
      unlinkSync(getDaemonStateFilePath());
    } catch {
      // already gone
    }
  };
  process.on("exit", removeStateFile);

  await server.whenShutdownRequested;
  await server.close();
  process.exit(0);
}

main().catch((error) => {
  consola.error(error);
  process.exit(1);
});
