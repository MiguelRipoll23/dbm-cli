import { defineCommand } from "citty";
import consola from "consola";
import type { Engine } from "../core/domain/connection.js";
import { VALID_ENGINES } from "../core/domain/connection.js";
import type { ConnectionService } from "../core/services/connection-service.js";

export function makeCreateCommand(connectionService: ConnectionService) {
  return defineCommand({
    meta: {
      name: "create",
      description: "Create a new database connection",
    },
    args: {
      name: { type: "string", required: true, description: "Connection name" },
      engine: { type: "string", required: true, description: "Database engine (mssql, oracle, mariadb, postgres)" },
      host: { type: "string", required: true, description: "Database host" },
      port: { type: "string", required: true, description: "Database port" },
      database: { type: "string", required: true, description: "Database name" },
      username: { type: "string", required: true, description: "Database username" },
      "keepass-db": { type: "string", required: true, description: "Path to the KeePass database file" },
      "keepass-entry": { type: "string", required: true, description: "KeePass entry path" },
      options: { type: "string", required: false, description: "Additional options as a JSON string" },
    },
    async run({ args }) {
      const engine = args.engine as string;
      if (!(VALID_ENGINES as string[]).includes(engine)) {
        throw new Error(
          `Invalid engine "${engine}". Must be one of: ${VALID_ENGINES.join(", ")}`,
        );
      }

      const port = parseInt(args.port as string, 10);
      if (isNaN(port) || port <= 0) {
        throw new Error(`Invalid port "${args.port}". Must be a positive integer.`);
      }

      let options: Record<string, string> | undefined;
      if (args.options) {
        try {
          options = JSON.parse(args.options as string) as Record<string, string>;
        } catch {
          throw new Error(`Invalid options JSON: ${args.options}`);
        }
      }

      await connectionService.create({
        name: args.name as string,
        engine: engine as Engine,
        host: args.host as string,
        port,
        database: args.database as string,
        username: args.username as string,
        keepass: {
          databasePath: args["keepass-db"] as string,
          entryPath: args["keepass-entry"] as string,
        },
        options,
      });

      consola.success(`Connection "${args.name}" created successfully.`);
    },
  });
}
