import os from "node:os";
import path from "node:path";

export function getConfigDirectory(): string {
  return path.join(os.homedir(), ".dbm");
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

export function getDaemonStateFilePath(): string {
  return path.join(getConfigDirectory(), "daemon.json");
}

export function getDaemonLogFilePath(): string {
  return path.join(getConfigDirectory(), "daemon.log");
}

const DEFAULT_DAEMON_PORT = 4320;

// Fixed loopback port the daemon binds to, so other CLI invocations can find
// it without any additional discovery mechanism. Overridable for tests.
export function getDaemonPort(): number {
  const override = Number(process.env.DBM_CLI_DAEMON_PORT);
  return Number.isInteger(override) && override > 0 ? override : DEFAULT_DAEMON_PORT;
}
