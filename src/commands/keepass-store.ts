import { randomBytes } from "node:crypto";
import { defineCommand } from "citty";
import consola from "consola";
import type { ConnectionService } from "../core/services/connection-service.js";
import type { SecretResolver } from "../core/ports/secret-resolver.js";
import { VALID_ENVIRONMENTS } from "../core/domain/connection.js";
import { promptMaskedPassword, promptText } from "../utilities/prompt.js";

export function makeKeepassStoreCommand(connectionService: ConnectionService, secretResolver: SecretResolver) {
  return defineCommand({
    meta: {
      name: "keepass-store",
      description: "Store or update a connection's credentials in KeePass",
    },
    args: {
      name: { type: "positional", description: "Connection name", required: true },
      environment: { type: "positional", description: "Environment (development, staging, production, local)", required: true },
      generate: { type: "boolean", required: false, description: "Generate a random password instead of prompting" },
    },
    async run({ args }) {
      try {
        const name = args.name as string;
        const environment = args.environment as string;

        if (!(VALID_ENVIRONMENTS as string[]).includes(environment)) {
          consola.error(`Invalid environment "${environment}". Must be one of: ${VALID_ENVIRONMENTS.join(", ")}`);
          process.exit(1);
        }

        const connection = await connectionService.get(name, environment);
        if (!connection) {
          consola.error(`Connection "${name}" in environment "${environment}" not found.`);
          process.exit(1);
        }

        const exists = await secretResolver.entryExists(name);
        if (exists) {
          const overwriteAnswer = await promptText("Entry already exists. Overwrite? [y/N]:");
          if (overwriteAnswer.toLowerCase() !== "y") {
            consola.info("Aborted. Credentials not changed.");
            return;
          }
        }

        const username = await promptText("Database username:");

        let password: string;
        if (args.generate) {
          password = randomBytes(16).toString("base64url").slice(0, 20);
          consola.info(`Generated password: ${password}`);
          consola.warn("Save this password — it will not be shown again.");
        } else {
          const modeAnswer = await promptText("Enter password [m]anually or [g]enerate random? [m/g]:");
          if (modeAnswer.toLowerCase() === "g") {
            password = randomBytes(16).toString("base64url").slice(0, 20);
            consola.info(`Generated password: ${password}`);
            consola.warn("Save this password — it will not be shown again.");
          } else {
            password = await promptMaskedPassword("Database password");
          }
        }

        if (exists) {
          await secretResolver.editEntry(name, username, password);
        } else {
          await secretResolver.storePassword(name, username, password);
        }
        consola.success(`Credentials stored in KeePass for connection "${name}" (${environment}).`);
      } catch (error) {
        consola.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    },
  });
}
