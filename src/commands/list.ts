import { defineCommand } from "citty";
import consola from "consola";
import type { ConnectionService } from "../core/services/connection-service.js";

export function makeListCommand(connectionService: ConnectionService) {
  return defineCommand({
    meta: {
      name: "list",
      description: "List all saved database connections",
    },
    async run() {
      try {
        const connections = await connectionService.list();

        if (connections.length === 0) {
          consola.log("No connections configured.");
          return;
        }

        const header = padRow("NAME", "ENGINE", "HOST", "PORT", "DATABASE", "USERNAME");
        const separator = "-".repeat(header.length);
        consola.log(separator);
        consola.log(header);
        consola.log(separator);
        for (const connection of connections) {
          consola.log(
            padRow(
              connection.name,
              connection.engine,
              connection.host,
              String(connection.port),
              connection.database,
              connection.username,
            ),
          );
        }
        consola.log(separator);
      } catch (error) {
        consola.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    },
  });
}

function padRow(
  name: string,
  engine: string,
  host: string,
  port: string,
  database: string,
  username: string,
): string {
  return [
    name.padEnd(24),
    engine.padEnd(10),
    host.padEnd(30),
    port.padEnd(8),
    database.padEnd(20),
    username.padEnd(20),
  ].join(" ");
}
