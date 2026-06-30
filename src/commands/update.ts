import { defineCommand } from "citty";
import consola from "consola";
import type { Connection, Engine } from "../core/domain/connection.js";
import type { ConnectionService } from "../core/services/connection-service.js";

const VALID_ENGINES: Engine[] = ["mssql", "oracle", "mariadb", "postgres"];

export function makeUpdateCommand(connectionService: ConnectionService) {
  return defineCommand({
    meta: {
      name: "update",
      description: "Update an existing database connection",
    },
    args: {
      name: { type: "positional", description: "Connection name", required: true },
      engine: { type: "string", required: false, description: "Database engine (mssql, oracle, mariadb, postgres)" },
      host: { type: "string", required: false, description: "Database host" },
      port: { type: "string", required: false, description: "Database port" },
      database: { type: "string", required: false, description: "Database name" },
      username: { type: "string", required: false, description: "Database username" },
      "keepass-db": { type: "string", required: false, description: "Path to the KeePass database file" },
      "keepass-entry": { type: "string", required: false, description: "KeePass entry path" },
      options: { type: "string", required: false, description: "Additional options as a JSON string" },
    },
    async run({ args }) {
      const name = args.name as string;
      const updates: Partial<Omit<Connection, "name">> = {};

      if (args.engine !== undefined) {
        const engine = args.engine as string;
        if (!(VALID_ENGINES as string[]).includes(engine)) {
          throw new Error(
            `Invalid engine "${engine}". Must be one of: ${VALID_ENGINES.join(", ")}`,
          );
        }
        updates.engine = engine as Engine;
      }

      if (args.host !== undefined) {
        updates.host = args.host as string;
      }

      if (args.port !== undefined) {
        const port = parseInt(args.port as string, 10);
        if (isNaN(port) || port <= 0) {
          throw new Error(`Invalid port "${args.port}". Must be a positive integer.`);
        }
        updates.port = port;
      }

      if (args.database !== undefined) {
        updates.database = args.database as string;
      }

      if (args.username !== undefined) {
        updates.username = args.username as string;
      }

      if (args["keepass-db"] !== undefined || args["keepass-entry"] !== undefined) {
        updates.keepass = {
          databasePath: args["keepass-db"] as string,
          entryPath: args["keepass-entry"] as string,
        };
      }

      if (args.options !== undefined) {
        try {
          updates.options = JSON.parse(args.options as string) as Record<string, string>;
        } catch {
          throw new Error(`Invalid options JSON: ${args.options}`);
        }
      }

      await connectionService.update(name, updates);
      consola.success(`Connection "${name}" updated successfully.`);
    },
  });
}
