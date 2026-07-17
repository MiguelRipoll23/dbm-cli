import { spawn } from "node:child_process";
import consola from "consola";
import type { ConnectionWithCredentials } from "../core/domain/connection.js";
import type { ClientLauncher } from "../core/ports/client-launcher.js";
import { ENGINE_CONFIGS, type EngineConfig } from "../constants/engines.js";

export type ResolvedStdio = {
  args: string[];
  stdinMode: "pipe" | "ignore" | "inherit";
  stdinPayload?: string;
};

export function resolveStdio(
  config: EngineConfig,
  connection: ConnectionWithCredentials,
  password: string,
  args: string[],
  executeCommand?: string,
): ResolvedStdio {
  if (executeCommand !== undefined) {
    if (config.buildExecuteStdin !== undefined) {
      return {
        args,
        stdinMode: "pipe",
        stdinPayload: config.buildExecuteStdin(connection, password, executeCommand),
      };
    }
    if (config.buildExecuteArgs !== undefined) {
      return { args: [...args, ...config.buildExecuteArgs(executeCommand)], stdinMode: "ignore" };
    }
    return { args, stdinMode: "inherit" };
  }

  if (config.buildStdin !== undefined) {
    return { args, stdinMode: "pipe", stdinPayload: config.buildStdin(connection, password) };
  }

  return { args, stdinMode: "inherit" };
}

export class NativeClientLauncher implements ClientLauncher {
  constructor(private readonly clientsDirectory: string) {}

  launch(connection: ConnectionWithCredentials, password: string, executeCommand?: string): Promise<void> {
    const config = ENGINE_CONFIGS[connection.engine];
    const binary = config.clientBinary;
    let args = config.buildArgs(connection);
    let extraEnv = config.buildEnv(password);

    if (connection.readOnly) {
      const hasSupport = config.buildReadOnlyArgs !== undefined || config.buildReadOnlyEnv !== undefined;
      if (!hasSupport) {
        consola.warn(`Read-only mode is not enforced for engine "${connection.engine}" at the client level.`);
      }
      if (config.buildReadOnlyArgs !== undefined) {
        args = [...args, ...config.buildReadOnlyArgs()];
      }
      if (config.buildReadOnlyEnv !== undefined) {
        extraEnv = { ...extraEnv, ...config.buildReadOnlyEnv() };
      }
    }

    const resolved = resolveStdio(config, connection, password, args, executeCommand);
    args = resolved.args;
    const { stdinMode, stdinPayload } = resolved;

    const pathSeparator = process.platform === "win32" ? ";" : ":";
    const existingPath = process.env.PATH ?? "";
    const augmentedPath = `${this.clientsDirectory}${pathSeparator}${existingPath}`;

    const child = spawn(binary, args, {
      stdio: [stdinMode, "inherit", "inherit"],
      env: { ...process.env, PATH: augmentedPath, ...extraEnv },
    });

    return new Promise<void>((resolve, reject) => {
      let settled = false;

      child.on("error", (error: NodeJS.ErrnoException) => {
        if (settled) return;
        settled = true;
        if (error.code === "ENOENT") {
          reject(
            new Error(
              `Client binary "${binary}" not found.\n` +
                `${config.downloadHint}\n` +
                `Then run: dbm-cli client-install ${connection.engine} <path-to-binary>`,
            ),
          );
        } else {
          reject(error);
        }
      });

      child.on("close", (code) => {
        if (settled) return;
        settled = true;
        if (code !== 0) {
          reject(new Error(`${binary} exited with code ${code}`));
        } else {
          resolve();
        }
      });

      if (stdinPayload !== undefined) {
        child.stdin!.write(stdinPayload);
        child.stdin!.end();
      }
    });
  }
}
