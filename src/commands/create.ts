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
      try {
        const engine = args.engine as string;
        if (!(VALID_ENGINES as string[]).includes(engine)) {
          consola.error(`Invalid engine "${engine}". Must be one of: ${VALID_ENGINES.join(", ")}`);
          process.exit(1);
        }

        const port = parseInt(args.port as string, 10);
        if (isNaN(port) || port <= 0) {
          consola.error(`Invalid port "${args.port}". Must be a positive integer.`);
          process.exit(1);
        }

        let options: Record<string, string> | undefined;
        if (args.options) {
          try {
            options = JSON.parse(args.options as string) as Record<string, string>;
          } catch {
            consola.error(`Invalid options JSON: ${args.options}`);
            process.exit(1);
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
      } catch (error) {
        consola.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    },
  });
}
