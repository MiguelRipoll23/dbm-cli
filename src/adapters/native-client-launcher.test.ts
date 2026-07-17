import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { ConnectionWithCredentials } from "../core/domain/connection.js";
import { ENGINE_CONFIGS } from "../constants/engines.js";
import { resolveStdio } from "./native-client-launcher.js";

function makeConnection(overrides: Partial<ConnectionWithCredentials> = {}): ConnectionWithCredentials {
  return {
    name: "test-conn",
    engine: "mariadb",
    host: "maria-host",
    port: 3306,
    database: "shop",
    username: "dbuser",
    ...overrides,
  } as ConnectionWithCredentials;
}

describe("resolveStdio", () => {
  it("inherits stdin for interactive sessions without buildStdin (regression: db connect ADR)", () => {
    const config = ENGINE_CONFIGS.mariadb;
    const connection = makeConnection();
    const resolved = resolveStdio(config, connection, "pw", config.buildArgs(connection));
    assert.equal(resolved.stdinMode, "inherit");
    assert.equal(resolved.stdinPayload, undefined);
  });

  it("pipes stdin for engines that need a login payload (oracle, interactive)", () => {
    const config = ENGINE_CONFIGS.oracle;
    const connection = makeConnection({ engine: "oracle", host: "ora-server", port: 1521, database: "ORCL", username: "scott" });
    const resolved = resolveStdio(config, connection, "pw", config.buildArgs(connection));
    assert.equal(resolved.stdinMode, "pipe");
    assert.ok(resolved.stdinPayload?.includes("CONNECT"));
  });

  it("ignores stdin and appends args when executing a one-off command via buildExecuteArgs", () => {
    const config = ENGINE_CONFIGS.mariadb;
    const connection = makeConnection();
    const resolved = resolveStdio(config, connection, "pw", config.buildArgs(connection), "SELECT 1");
    assert.equal(resolved.stdinMode, "ignore");
    assert.deepEqual(resolved.args.slice(-2), ["-e", "SELECT 1"]);
    assert.equal(resolved.stdinPayload, undefined);
  });

  it("pipes the execute payload for engines that need it via buildExecuteStdin", () => {
    const config = ENGINE_CONFIGS.oracle;
    const connection = makeConnection({ engine: "oracle", host: "ora-server", port: 1521, database: "ORCL", username: "scott" });
    const resolved = resolveStdio(config, connection, "pw", config.buildArgs(connection), "SELECT 1 FROM DUAL");
    assert.equal(resolved.stdinMode, "pipe");
    assert.ok(resolved.stdinPayload?.includes("SELECT 1 FROM DUAL"));
  });
});
