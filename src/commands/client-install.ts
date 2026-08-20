import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { defineCommand } from "citty";
import consola from "consola";
import { ENGINE_CONFIGS } from "../constants/engines.js";
import type { Engine } from "../core/domain/connection.js";
import { VALID_ENGINES } from "../core/domain/connection.js";
import { getClientsDirectory } from "../config/paths.js";

function addClientsDirectoryToUserPath(clientsDirectory: string): void {
  if (process.platform === "win32") {
    const currentPath = execFileSync("powershell", [
      "-NoProfile",
      "-Command",
      "[Environment]::GetEnvironmentVariable('PATH', 'User')",
    ])
      .toString()
      .trim();

    const pathEntries = currentPath.split(";").filter(Boolean);
    if (pathEntries.includes(clientsDirectory)) {
      consola.info("PATH already contains the clients directory.");
      return;
    }

    const newPath = [...pathEntries, clientsDirectory].join(";");
    execFileSync("powershell", [
      "-NoProfile",
      "-Command",
      `[Environment]::SetEnvironmentVariable('PATH', '${newPath}', 'User')`,
    ]);
  } else {
    const profilePath = path.join(os.homedir(), ".profile");
    const exportLine = `\nexport PATH="$PATH:${clientsDirectory}"`;
    fs.appendFileSync(profilePath, exportLine, "utf8");
  }

  consola.success(`Added ${clientsDirectory} to your user PATH.`);
  consola.info("Restart your terminal for the PATH change to take effect.");
}

export function makeClientInstallCommand() {
  return defineCommand({
    meta: {
      name: "client-install",
      description: "Install a database client binary into the dbm-cli managed directory",
    },
    args: {
      engine: {
        type: "positional",
        description: "Database engine: mssql, oracle, mariadb, postgres",
        required: true,
      },
      source: {
        type: "positional",
        description: "Path to the downloaded binary file",
        required: true,
      },
      addToPath: {
        type: "boolean",
        description: "Add ~/.dbm/clients to your user PATH permanently",
        default: false,
      },
    },
    async run({ args }) {
      try {
        if (!VALID_ENGINES.includes(args.engine as Engine)) {
          consola.error(
            `Unknown engine "${args.engine}". Valid engines: ${VALID_ENGINES.join(", ")}.`,
          );
          process.exit(1);
        }

        const engine = args.engine as Engine;
        const config = ENGINE_CONFIGS[engine];

        const sourcePath = path.resolve(args.source);
        if (!fs.existsSync(sourcePath)) {
          consola.error(`Source file not found: ${sourcePath}`);
          process.exit(1);
        }

        const clientsDirectory = getClientsDirectory();
        fs.mkdirSync(clientsDirectory, { recursive: true });

        const binaryName =
          process.platform === "win32"
            ? `${config.clientBinary}.exe`
            : config.clientBinary;
        const destinationPath = path.join(clientsDirectory, binaryName);

        fs.copyFileSync(sourcePath, destinationPath);

        if (process.platform !== "win32") {
          fs.chmodSync(destinationPath, 0o755);
        }

        consola.success(`Installed "${binaryName}" to ${destinationPath}`);

        if (args.addToPath) {
          addClientsDirectoryToUserPath(clientsDirectory);
        } else {
          consola.info(
            `Run with --add-to-path to add ${clientsDirectory} to your user PATH permanently.`,
          );
        }
      } catch (error) {
        consola.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    },
  });
}
