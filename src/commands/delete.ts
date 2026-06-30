import { defineCommand } from "citty";
import consola from "consola";
import type { ConnectionService } from "../core/services/connection-service.js";
import { VALID_ENVIRONMENTS } from "../core/domain/connection.js";

export function makeDeleteCommand(connectionService: ConnectionService) {
  return defineCommand({
    meta: {
      name: "delete",
      description: "Delete a saved database connection",
    },
    args: {
      name: { type: "positional", description: "Connection name", required: true },
      environment: { type: "positional", description: "Environment (development, staging, production, local)", required: true },
    },
    async run({ args }) {
      try {
        const name = args.name as string;
        const environment = args.environment as string;

        if (!(VALID_ENVIRONMENTS as string[]).includes(environment)) {
          consola.error(`Invalid environment "${environment}". Must be one of: ${VALID_ENVIRONMENTS.join(", ")}`);
          process.exit(1);
        }

        await connectionService.delete(name, environment);
        consola.success(`Connection "${name}" (${environment}) deleted successfully.`);
      } catch (error) {
        consola.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    },
  });
}
