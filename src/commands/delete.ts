import { defineCommand } from "citty";
import consola from "consola";
import type { ConnectionService } from "../core/services/connection-service.js";

export function makeDeleteCommand(connectionService: ConnectionService) {
  return defineCommand({
    meta: {
      name: "delete",
      description: "Delete a saved database connection",
    },
    args: {
      name: { type: "positional", description: "Connection name", required: true },
    },
    async run({ args }) {
      try {
        const name = args.name as string;
        await connectionService.delete(name);
        consola.success(`Connection "${name}" deleted successfully.`);
      } catch (error) {
        consola.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    },
  });
}
