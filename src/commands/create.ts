import { defineCommand } from "citty";
import consola from "consola";
import type { Engine, Environment } from "../core/domain/connection.js";
import { VALID_ENGINES, VALID_ENVIRONMENTS } from "../core/domain/connection.js";
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
      environment: { type: "string", required: true, description: "Environment (development, staging, production, local)" },
      options: { type: "string", required: false, description: "Additional options as a JSON string" },
      readOnly: { type: "boolean", required: false, description: "Mark connection as read-only" },
    },
    async run({ args }) {
      try {
        const engine = args.engine as string;
        if (!(VALID_ENGINES as string[]).includes(engine)) {
          consola.error(`Invalid engine "${engine}". Must be one of: ${VALID_ENGINES.join(", ")}`);
          process.exit(1);
        }

        const environment = args.environment as string;
        if (!(VALID_ENVIRONMENTS as string[]).includes(environment)) {
          consola.error(`Invalid environment "${environment}". Must be one of: ${VALID_ENVIRONMENTS.join(", ")}`);
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

        const connectionName = args.name as string;

        await connectionService.create({
          name: connectionName,
          engine: engine as Engine,
          host: args.host as string,
          port,
          database: args.database as string,
          environment: environment as Environment,
          readOnly: args.readOnly as boolean | undefined,
          options,
        });

        consola.success(`Connection "${connectionName}" created successfully.`);
        consola.info(`Run "dbm-cli web" to add credentials for this connection.`);
      } catch (error) {
        consola.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    },
  });
}
