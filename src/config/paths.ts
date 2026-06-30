import os from "node:os";
import path from "node:path";

export function getConfigDirectory(): string {
  return path.join(os.homedir(), ".db-cli");
}

export function getConnectionsFilePath(): string {
  return path.join(getConfigDirectory(), "connections.json");
}

export function getClientsDirectory(): string {
  return path.join(getConfigDirectory(), "clients");
}
