import { defineCommand } from "citty";
import consola from "consola";
import type { ConnectService } from "../core/services/connect-service.js";
import { VALID_ENVIRONMENTS } from "../core/domain/connection.js";
import { promptText } from "../utilities/prompt.js";

export function makeConnectCommand(connectService: ConnectService) {
  return defineCommand({
    meta: {
      name: "connect",
      description:
        "Connect to a saved database. The first connect starts a background daemon (see 'dbm daemon') " +
        "that caches the decrypted password in memory, so later connects to the same connection skip the browser unlock step.",
    },
    args: {
      name: {
        type: "positional",
        description: "Name of the connection to use",
        required: true,
      },
      environment: {
        type: "positional",
        description: "Environment (development, staging, production, local) — defaults to development",
        required: false,
      },
      execute: {
        type: "string",
        alias: "e",
        required: false,
        description: "SQL command to execute non-interactively",
      },
    },
    async run({ args }) {
      try {
        const environment = (args.environment as string | undefined) ?? "development";
        if (!(VALID_ENVIRONMENTS as string[]).includes(environment)) {
          consola.error(`Invalid environment "${environment}". Must be one of: ${VALID_ENVIRONMENTS.join(", ")}`);
          process.exit(1);
        }

        if (environment === "production") {
          const answer = await promptText("You are connecting to PRODUCTION. Type 'yes' to continue: ");
          if (answer.toLowerCase() !== "yes") {
            consola.info("Connection cancelled.");
            return;
          }
        }

        const name = args.name as string;
        const executeCommand = args.execute as string | undefined;
        try {
          await connectService.connect(name, environment, executeCommand);
        } catch (error) {
          if (error instanceof Error && error.message.includes("not found")) {
            const available = await connectService.findEnvironments(name);
            if (available.length > 0) {
              consola.error(`Connection "${name}" not found in environment "${environment}".`);
              consola.info(`Available environments: ${available.join(", ")}`);
            } else {
              consola.error(error.message);
            }
            process.exit(1);
          }
          throw error;
        }
      } catch (error) {
        consola.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    },
  });
}
