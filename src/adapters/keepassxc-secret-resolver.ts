import { spawn } from "node:child_process";
import consola from "consola";
import type { KeepassReference } from "../core/domain/connection.js";
import type { SecretResolver } from "../core/ports/secret-resolver.js";

type SpawnFunction = typeof import("node:child_process").spawn;

export class KeepassxcSecretResolver implements SecretResolver {
  constructor(private readonly spawnFunction: SpawnFunction = spawn) {}

  resolvePassword(reference: KeepassReference): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const masterPasswordPromise =
        process.env.KEEPASSXC_MASTER !== undefined
          ? Promise.resolve(process.env.KEEPASSXC_MASTER)
          : consola.prompt("KeePassXC master password:", { type: "text" });

      masterPasswordPromise
        .then((masterPassword) => {
          const child = this.spawnFunction(
            "keepassxc-cli",
            ["show", "-a", "Password", "-q", reference.databasePath, reference.entryPath],
            { stdio: ["pipe", "pipe", "pipe"] },
          );

          const stdoutChunks: Buffer[] = [];
          const stderrChunks: Buffer[] = [];

          child.stdout.on("data", (chunk: Buffer) => {
            stdoutChunks.push(chunk);
          });

          child.stderr.on("data", (chunk: Buffer) => {
            stderrChunks.push(chunk);
          });

          child.stdin.write(masterPassword + "\n");
          child.stdin.end();

          child.on("close", (code) => {
            const stderr = Buffer.concat(stderrChunks).toString("utf8");
            if (code !== 0) {
              reject(new Error(`keepassxc-cli failed (exit ${code}): ${stderr}`));
              return;
            }
            const stdout = Buffer.concat(stdoutChunks).toString("utf8");
            resolve(stdout.trim());
          });

          child.on("error", (error) => {
            reject(error);
          });
        })
        .catch(reject);
    });
  }
}
