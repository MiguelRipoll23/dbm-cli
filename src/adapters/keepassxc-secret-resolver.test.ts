import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import type { KeepassReference } from "../core/domain/connection.js";
import { KeepassxcSecretResolver } from "./keepassxc-secret-resolver.js";

const testReference: KeepassReference = {
  databasePath: "/path/to/database.kdbx",
  entryPath: "group/my-entry",
};

function makeFakeChild() {
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const emitter = new EventEmitter();

  const child = Object.assign(emitter, { stdin, stdout, stderr });
  return child;
}

describe("KeepassxcSecretResolver", () => {
  beforeEach(() => {
    process.env.KEEPASSXC_MASTER = "testmaster";
  });

  it("sends master password via stdin, not via argv", async () => {
    let capturedArgs: string[] = [];
    let stdinData = "";

    const fakeSpawn = (_command: string, args: string[], _options: unknown) => {
      capturedArgs = args;
      const child = makeFakeChild();

      child.stdin.on("data", (chunk: Buffer) => {
        stdinData += chunk.toString("utf8");
      });

      setImmediate(() => {
        child.stdout.push("secretpassword\n");
        child.stdout.push(null);
        child.stderr.push(null);
        child.emit("close", 0);
      });

      return child;
    };

    const resolver = new KeepassxcSecretResolver(fakeSpawn as never);
    await resolver.resolvePassword(testReference);

    assert.ok(
      stdinData.includes("testmaster"),
      "Master password should appear in stdin data",
    );

    assert.ok(
      !capturedArgs.includes("testmaster"),
      "Master password must NOT appear in argv",
    );
  });

  it("returns trimmed stdout on success", async () => {
    const fakeSpawn = (_command: string, _args: string[], _options: unknown) => {
      const child = makeFakeChild();

      setImmediate(() => {
        child.stdout.push("  secretpassword\n  ");
        child.stdout.push(null);
        child.stderr.push(null);
        child.emit("close", 0);
      });

      return child;
    };

    const resolver = new KeepassxcSecretResolver(fakeSpawn as never);
    const result = await resolver.resolvePassword(testReference);

    assert.equal(result, "secretpassword");
  });

  it("throws on non-zero exit code", async () => {
    const fakeSpawn = (_command: string, _args: string[], _options: unknown) => {
      const child = makeFakeChild();

      setImmediate(() => {
        child.stdout.push(null);
        child.stderr.push("wrong key");
        child.stderr.push(null);
        child.emit("close", 1);
      });

      return child;
    };

    const resolver = new KeepassxcSecretResolver(fakeSpawn as never);

    await assert.rejects(
      () => resolver.resolvePassword(testReference),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.ok(
          error.message.includes("keepassxc-cli failed"),
          `Expected "keepassxc-cli failed" in: ${error.message}`,
        );
        assert.ok(
          error.message.includes("exit 1"),
          `Expected "exit 1" in: ${error.message}`,
        );
        return true;
      },
    );
  });
});
