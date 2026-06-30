import { defineCommand } from "citty";
import consola from "consola";
import type { ConnectService } from "../core/services/connect-service.js";

export function makeConnectCommand(connectService: ConnectService) {
  return defineCommand({
    meta: {
      name: "connect",
      description: "Connect to a saved database",
    },
    args: {
      name: {
        type: "positional",
        description: "Name of the connection to use",
        required: true,
      },
    },
    async run({ args }) {
      try {
        await connectService.connect(args.name);
      } catch (error) {
        consola.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    },
  });
}
