import { spawn } from "node:child_process";
import readline from "node:readline";
import type { KeepassReference } from "../core/domain/connection.js";
import type { SecretResolver } from "../core/ports/secret-resolver.js";

type SpawnFunction = typeof import("node:child_process").spawn;

function promptMaskedPassword(message: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    process.stdout.write(`${message}: `);
    // Suppress echo so the typed password is not visible on the terminal.
    // _writeToOutput is an internal readline hook — the standard community
    // workaround for echo suppression without external dependencies.
    // See: https://github.com/nodejs/node/issues/11887
    (rl as unknown as { _writeToOutput: () => void })._writeToOutput = () => {};
    rl.question("", (answer) => {
      process.stdout.write("\n");
      rl.close();
      resolve(answer);
    });
  });
}

export class KeepassxcSecretResolver implements SecretResolver {
  constructor(private readonly spawnFunction: SpawnFunction = spawn) {}

  async resolvePassword(reference: KeepassReference): Promise<string> {
    const masterPassword =
      process.env.KEEPASSXC_MASTER !== undefined
        ? process.env.KEEPASSXC_MASTER
        : await promptMaskedPassword("KeePassXC master password");

    return new Promise<string>((resolve, reject) => {
      const child = this.spawnFunction(
        "keepassxc-cli",
        ["show", "-a", "Password", "-q", reference.databasePath, reference.entryPath],
        { stdio: ["pipe", "pipe", "pipe"] },
      );

      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];

      child.stdout!.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
      child.stderr!.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

      child.on("error", reject);

      child.on("close", (code) => {
        if (code !== 0) {
          const stderr = Buffer.concat(stderrChunks).toString().trim();
          reject(new Error(`keepassxc-cli failed (exit ${code}): ${stderr}`));
          return;
        }
        resolve(Buffer.concat(stdoutChunks).toString().trim());
      });

      child.stdin!.write(masterPassword + "\n");
      child.stdin!.end();
    });
  }
}
