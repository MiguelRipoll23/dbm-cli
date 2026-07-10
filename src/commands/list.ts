import { defineCommand } from "citty";
import consola from "consola";
import type { ConnectionService } from "../core/services/connection-service.js";
import type { Connection } from "../core/domain/connection.js";

const reset = "\x1b[0m";
const bold = "\x1b[1m";
const nameColor = "\x1b[38;5;183m";
const labelColor = "\x1b[38;5;152m";
const dimColor = "\x1b[2m";

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

        // Group by name (preserve insertion order)
        const groups = new Map<string, Connection[]>();
        for (const connection of connections) {
          const group = groups.get(connection.name) ?? [];
          group.push(connection);
          groups.set(connection.name, group);
        }

        const lines: string[] = [];
        let first = true;
        for (const [name, envConnections] of groups) {
          if (!first) lines.push("");
          first = false;
          const engine = envConnections[0]!.engine;
          lines.push(`${bold}${nameColor}● ${name}${reset}  ${dimColor}[${engine}]${reset}`);
          for (const c of envConnections) {
            const location = `${c.host}:${c.port}/${c.database}`;
            const readOnlyTag = c.readOnly ? `  ${dimColor}[read-only]${reset}` : "";
            lines.push(`  ${labelColor}${c.environment.padEnd(13)}${reset}${location}${readOnlyTag}`);
          }
        }

        for (const line of lines) {
          consola.log(line);
        }
      } catch (error) {
        consola.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    },
  });
}
