import { spawn } from "node:child_process";
import type { ConnectionWithCredentials } from "../core/domain/connection.js";
import type { ClientLauncher } from "../core/ports/client-launcher.js";
import { ENGINE_CONFIGS } from "../constants/engines.js";

export class NativeClientLauncher implements ClientLauncher {
  constructor(private readonly clientsDirectory: string) {}

  launch(connection: ConnectionWithCredentials, password: string): Promise<void> {
    const config = ENGINE_CONFIGS[connection.engine];
    const binary = config.clientBinary;
    const args = config.buildArgs(connection);
    const extraEnv = config.buildEnv(password);

    const pathSeparator = process.platform === "win32" ? ";" : ":";
    const existingPath = process.env.PATH ?? "";
    const augmentedPath = `${this.clientsDirectory}${pathSeparator}${existingPath}`;

    const child = spawn(binary, args, {
      stdio: ["pipe", "inherit", "inherit"],
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
                `Then run: db-cli client-install ${connection.engine} <path-to-binary>`,
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

      if (config.buildStdin !== undefined) {
        const stdinPayload = config.buildStdin(connection, password);
        child.stdin!.write(stdinPayload);
        child.stdin!.end();
      }
    });
  }
}
