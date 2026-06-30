import { defineCommand } from "citty";
import consola from "consola";
import type { ConnectionService } from "../core/services/connection-service.js";

export function makeListCommand(connectionService: ConnectionService) {
  return defineCommand({
    meta: {
      name: "list",
      description: "List all saved database connections",
    },
    args: {
      env: { type: "string", required: false, description: "Filter by environment (development, staging, production, local)" },
    },
    async run({ args }) {
      try {
        let connections = await connectionService.list();

        if (args.env) {
          connections = connections.filter((c) => c.environment === args.env);
        }

        if (connections.length === 0) {
          consola.log("No connections configured.");
          return;
        }

        const header = padRow("NAME", "ENGINE", "ENVIRONMENT", "HOST", "PORT", "DATABASE", "USERNAME");
        const separator = "-".repeat(header.length);
        consola.log(separator);
        consola.log(header);
        consola.log(separator);
        for (const connection of connections) {
          consola.log(
            padRow(
              connection.name,
              connection.engine,
              connection.environment ?? "—",
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
  environment: string,
  host: string,
  port: string,
  database: string,
  username: string,
): string {
  return [
    name.padEnd(20),
    engine.padEnd(10),
    environment.padEnd(14),
    host.padEnd(24),
    port.padEnd(6),
    database.padEnd(20),
    username.padEnd(16),
  ].join(" ");
}
