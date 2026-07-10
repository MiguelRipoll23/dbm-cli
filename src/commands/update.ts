import { defineCommand } from "citty";
import consola from "consola";
import type { Connection } from "../core/domain/connection.js";
import { VALID_ENVIRONMENTS } from "../core/domain/connection.js";
import type { ConnectionService } from "../core/services/connection-service.js";

export function makeUpdateCommand(connectionService: ConnectionService) {
  return defineCommand({
    meta: {
      name: "update",
      description: "Update an existing database connection",
    },
    args: {
      name: { type: "positional", description: "Connection name", required: true },
      environment: { type: "positional", description: "Environment (development, staging, production, local)", required: true },
      rename: { type: "string", required: false, description: "Rename the connection" },
      host: { type: "string", required: false, description: "Database host" },
      port: { type: "string", required: false, description: "Database port" },
      database: { type: "string", required: false, description: "Database name" },
      options: { type: "string", required: false, description: "Additional options as a JSON string" },
      readOnly: { type: "boolean", required: false, description: "Mark connection as read-only" },
    },
    async run({ args }) {
      try {
        const name = args.name as string;
        const environment = args.environment as string;
        const renameTo = args.rename as string | undefined;

        if (!(VALID_ENVIRONMENTS as string[]).includes(environment)) {
          consola.error(`Invalid environment "${environment}". Must be one of: ${VALID_ENVIRONMENTS.join(", ")}`);
          process.exit(1);
        }

        const existing = await connectionService.getByName(name, environment);
        if (existing === undefined) {
          consola.error(`Connection "${name}" in environment "${environment}" not found`);
          process.exit(1);
        }

        const updates: Partial<Omit<Connection, "id">> = {};

        if (renameTo !== undefined) {
          updates.name = renameTo;
        }

        if (args.host !== undefined) {
          updates.host = args.host as string;
        }

        if (args.port !== undefined) {
          const port = parseInt(args.port as string, 10);
          if (isNaN(port) || port <= 0) {
            consola.error(`Invalid port "${args.port}". Must be a positive integer.`);
            process.exit(1);
          }
          updates.port = port;
        }

        if (args.database !== undefined) {
          updates.database = args.database as string;
        }

        if (args.options !== undefined) {
          try {
            updates.options = JSON.parse(args.options as string) as Record<string, string>;
          } catch {
            consola.error(`Invalid options JSON: ${args.options}`);
            process.exit(1);
          }
        }

        if (args.readOnly !== undefined) {
          updates.readOnly = args.readOnly as boolean;
        }

        if (Object.keys(updates).length > 0) {
          const updated = await connectionService.update(existing.id, updates);
          consola.success(`Connection "${updated.name}" (${updated.environment}) updated successfully.`);
        }
      } catch (error) {
        consola.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    },
  });
}
