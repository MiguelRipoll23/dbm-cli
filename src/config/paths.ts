import envPaths from "env-paths";
import path from "node:path";

export function getConfigDirectory(): string {
  return envPaths("db-cli", { suffix: "" }).config;
}

export function getConnectionsFilePath(): string {
  return path.join(getConfigDirectory(), "connections.json");
}
