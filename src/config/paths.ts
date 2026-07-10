import os from "node:os";
import path from "node:path";

export function getConfigDirectory(): string {
  return path.join(os.homedir(), ".db-cli");
}

export function getConnectionsDbPath(): string {
  return path.join(getConfigDirectory(), "connections.db");
}

export function getCredentialsFilePath(): string {
  return path.join(getConfigDirectory(), "credentials.enc");
}

export function getClientsDirectory(): string {
  return path.join(getConfigDirectory(), "clients");
}
