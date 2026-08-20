import { defineCommand } from "citty";
import consola from "consola";
import type { DaemonManager } from "../adapters/daemon-manager.js";

const DAEMON_DESCRIPTION =
  "Manage the dbm background daemon. `connect` starts this daemon automatically the first time it's needed — " +
  "you normally never run `daemon start` yourself. While running, the daemon holds decrypted database passwords " +
  "in memory only (never written to disk) so repeated `connect` calls to the same connection skip the browser " +
  "unlock step. Cached passwords are discarded when the daemon stops or after 30 minutes of inactivity for that connection.";

export function makeDaemonCommand(daemonManager: DaemonManager) {
  return defineCommand({
    meta: {
      name: "daemon",
      description: DAEMON_DESCRIPTION,
    },
    subCommands: {
      start: defineCommand({
        meta: { name: "start", description: "Start the background daemon if it isn't already running." },
        async run() {
          const { baseUrl } = await daemonManager.ensureStarted();
          consola.success(`Daemon running at ${baseUrl}`);
        },
      }),
      stop: defineCommand({
        meta: {
          name: "stop",
          description: "Stop the background daemon and immediately discard every cached decrypted password from memory.",
        },
        async run() {
          const stopped = await daemonManager.stop();
          consola.success(stopped ? "Daemon stopped." : "Daemon was not running.");
        },
      }),
      status: defineCommand({
        meta: {
          name: "status",
          description:
            "Show whether the daemon is running (PID, port, uptime) and how many decrypted passwords are currently cached.",
        },
        async run() {
          const status = await daemonManager.status();
          if (!status.running) {
            consola.info("Daemon is not running.");
            return;
          }
          const uptimeSeconds = Math.round(status.uptimeMs / 1000);
          consola.info(
            `Daemon running — pid ${status.pid}, port ${status.port}, uptime ${uptimeSeconds}s, ${status.cachedCount} cached password(s).`,
          );
        },
      }),
      restart: defineCommand({
        meta: { name: "restart", description: "Restart the daemon — equivalent to stop + start. Clears the in-memory password cache." },
        async run() {
          await daemonManager.restart();
          consola.success("Daemon restarted.");
        },
      }),
    },
  });
}
