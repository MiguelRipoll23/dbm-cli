import { createRequire } from "node:module";
import { defineCommand, runMain } from "citty";
import listCommand from "./commands/list.js";
import createCommand from "./commands/create.js";
import updateCommand from "./commands/update.js";
import deleteCommand from "./commands/delete.js";
import connectCommand from "./commands/connect.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };

const rootCommand = defineCommand({
  meta: {
    name: "db-cli",
    version,
    description: "Database connection manager",
  },
  subCommands: {
    list: listCommand,
    create: createCommand,
    update: updateCommand,
    delete: deleteCommand,
    connect: connectCommand,
  },
});

runMain(rootCommand);
