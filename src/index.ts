#!/usr/bin/env node
import { createRequire } from "node:module";
import { defineCommand, runMain } from "citty";
import { SqliteConnectionRepository } from "./adapters/sqlite-connection-repository.js";
import { FileCredentialStore } from "./adapters/file-credential-store.js";
import { WebSecretResolver } from "./adapters/web-secret-resolver.js";
import { NativeClientLauncher } from "./adapters/native-client-launcher.js";
import { DaemonManager } from "./adapters/daemon-manager.js";
import { DaemonClient } from "./adapters/daemon-client.js";
import { getClientsDirectory, getConnectionsDbPath, getCredentialsFilePath } from "./config/paths.js";
import { ConnectionService } from "./core/services/connection-service.js";
import { ConnectService } from "./core/services/connect-service.js";
import { makeListCommand } from "./commands/list.js";
import { makeCreateCommand } from "./commands/create.js";
import { makeUpdateCommand } from "./commands/update.js";
import { makeDeleteCommand } from "./commands/delete.js";
import { makeConnectCommand } from "./commands/connect.js";
import { makeWebCommand } from "./commands/web.js";
import { makeDaemonCommand } from "./commands/daemon.js";
import { makeClientInstallCommand } from "./commands/client-install.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };

const repository = new SqliteConnectionRepository(getConnectionsDbPath());
const connectionService = new ConnectionService(repository);
const credentialStore = new FileCredentialStore(getCredentialsFilePath());
const daemonManager = new DaemonManager();
const daemonClient = new DaemonClient();
const secretResolver = new WebSecretResolver(daemonManager, daemonClient);

const clientLauncher = new NativeClientLauncher(getClientsDirectory());
const connectService = new ConnectService(repository, secretResolver, clientLauncher);

const rootCommand = defineCommand({
  meta: {
    name: "dbm",
    version,
    description: "Database connection manager",
  },
  subCommands: {
    list: makeListCommand(connectionService),
    create: makeCreateCommand(connectionService),
    update: makeUpdateCommand(connectionService),
    delete: makeDeleteCommand(connectionService),
    connect: makeConnectCommand(connectService),
    web: makeWebCommand(connectionService, credentialStore),
    daemon: makeDaemonCommand(daemonManager),
    "client-install": makeClientInstallCommand(),
  },
});

runMain(rootCommand);
