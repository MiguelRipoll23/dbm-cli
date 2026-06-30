#!/usr/bin/env node
import { createRequire } from "node:module";
import { defineCommand, runMain } from "citty";
import { JsonConnectionRepository } from "./adapters/json-connection-repository.js";
import { KeepassxcSocketResolver } from "./adapters/keepassxc-socket-resolver.js";
import { NativeClientLauncher } from "./adapters/native-client-launcher.js";
import { getClientsDirectory, getConfigDirectory, getConnectionsFilePath } from "./config/paths.js";
import { ConnectionService } from "./core/services/connection-service.js";
import { ConnectService } from "./core/services/connect-service.js";
import { makeListCommand } from "./commands/list.js";
import { makeCreateCommand } from "./commands/create.js";
import { makeUpdateCommand } from "./commands/update.js";
import { makeDeleteCommand } from "./commands/delete.js";
import { makeConnectCommand } from "./commands/connect.js";
import { makeKeepassStoreCommand } from "./commands/keepass-store.js";
import { makeClientInstallCommand } from "./commands/client-install.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };

const configDirectory = getConfigDirectory();
const repository = new JsonConnectionRepository(getConnectionsFilePath());
const connectionService = new ConnectionService(repository);
const secretResolver = new KeepassxcSocketResolver(configDirectory);

const clientLauncher = new NativeClientLauncher(getClientsDirectory());
const connectService = new ConnectService(repository, secretResolver, clientLauncher);

const rootCommand = defineCommand({
  meta: {
    name: "db-cli",
    version,
    description: "Database connection manager",
  },
  subCommands: {
    list: makeListCommand(connectionService),
    create: makeCreateCommand(connectionService, secretResolver),
    update: makeUpdateCommand(connectionService),
    delete: makeDeleteCommand(connectionService),
    connect: makeConnectCommand(connectService),
    "keepass-store": makeKeepassStoreCommand(connectionService, secretResolver),
    "client-install": makeClientInstallCommand(),
  },
});

runMain(rootCommand);
