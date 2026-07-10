import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { ConnectionWithCredentials, Engine } from "../core/domain/connection.js";
import { ENGINE_CONFIGS } from "./engines.js";

function makeConnection(overrides: Partial<ConnectionWithCredentials> = {}): ConnectionWithCredentials {
  return {
    name: "test-conn",
    engine: "postgres",
    host: "db.example.com",
    port: 5432,
    database: "testdb",
    username: "testuser",
    ...overrides,
  } as ConnectionWithCredentials;
}

const TEST_PASSWORD = "s3cr3tP@ssw0rd";

describe("ENGINE_CONFIGS", () => {
  describe("mssql", () => {
    const config = ENGINE_CONFIGS.mssql;
    const connection = makeConnection({ engine: "mssql", host: "sql-server", port: 1433, database: "sales", username: "sa" });

    it("buildArgs returns correct arguments in correct order", () => {
      const args = config.buildArgs(connection);
      assert.deepEqual(args, ["-S", "sql-server,1433", "-U", "sa", "-d", "sales"]);
    });

    it("buildEnv returns correct env var with the password", () => {
      const env = config.buildEnv(TEST_PASSWORD);
      assert.deepEqual(env, { SQLCMDPASSWORD: TEST_PASSWORD });
    });

    it("password does not appear in buildArgs", () => {
      const args = config.buildArgs(connection);
      assert.ok(!args.includes(TEST_PASSWORD), "Password must not appear in args");
    });

    it("buildStdin is undefined", () => {
      assert.equal(config.buildStdin, undefined);
    });
  });

  describe("oracle", () => {
    const config = ENGINE_CONFIGS.oracle;
    const connection = makeConnection({ engine: "oracle", host: "ora-server", port: 1521, database: "ORCL", username: "scott" });

    it("buildArgs returns correct arguments", () => {
      const args = config.buildArgs(connection);
      assert.deepEqual(args, ["/nolog"]);
    });

    it("buildEnv returns empty object (no password in env)", () => {
      const env = config.buildEnv(TEST_PASSWORD);
      assert.deepEqual(env, {});
      assert.ok(!Object.values(env).includes(TEST_PASSWORD), "Password must not appear in env values");
    });

    it("password does not appear in buildArgs", () => {
      const args = config.buildArgs(connection);
      assert.ok(!args.includes(TEST_PASSWORD), "Password must not appear in args");
    });

    it("buildStdin contains the password", () => {
      assert.ok(config.buildStdin !== undefined, "buildStdin must be defined for oracle");
      const stdin = config.buildStdin(connection, TEST_PASSWORD);
      assert.ok(stdin.includes(TEST_PASSWORD), "Password must appear in buildStdin output");
    });

    it("buildStdin contains correct CONNECT command", () => {
      assert.ok(config.buildStdin !== undefined);
      const stdin = config.buildStdin(connection, TEST_PASSWORD);
      assert.equal(stdin, `CONNECT scott/${TEST_PASSWORD}@ora-server:1521/ORCL\n`);
    });
  });

  describe("mariadb", () => {
    const config = ENGINE_CONFIGS.mariadb;
    const connection = makeConnection({ engine: "mariadb", host: "maria-host", port: 3306, database: "shop", username: "dbuser" });

    it("buildArgs returns correct arguments in correct order", () => {
      const args = config.buildArgs(connection);
      assert.deepEqual(args, ["-h", "maria-host", "-P", "3306", "-u", "dbuser", "shop"]);
    });

    it("buildEnv returns correct env var with the password", () => {
      const env = config.buildEnv(TEST_PASSWORD);
      assert.deepEqual(env, { MYSQL_PWD: TEST_PASSWORD });
    });

    it("password does not appear in buildArgs", () => {
      const args = config.buildArgs(connection);
      assert.ok(!args.includes(TEST_PASSWORD), "Password must not appear in args");
    });

    it("buildStdin is undefined", () => {
      assert.equal(config.buildStdin, undefined);
    });
  });

  describe("downloadHint", () => {
    const engines: Engine[] = ["mssql", "oracle", "mariadb", "postgres"];

    for (const engine of engines) {
      it(`${engine} has a non-empty downloadHint`, () => {
        assert.ok(
          typeof ENGINE_CONFIGS[engine].downloadHint === "string" &&
            ENGINE_CONFIGS[engine].downloadHint.length > 0,
          `downloadHint must be a non-empty string for ${engine}`,
        );
      });
    }
  });

  describe("postgres", () => {
    const config = ENGINE_CONFIGS.postgres;
    const connection = makeConnection({ engine: "postgres", host: "pg-host", port: 5432, database: "analytics", username: "pguser" });

    it("buildArgs returns correct arguments in correct order", () => {
      const args = config.buildArgs(connection);
      assert.deepEqual(args, ["-h", "pg-host", "-p", "5432", "-U", "pguser", "-d", "analytics"]);
    });

    it("buildEnv returns correct env var with the password", () => {
      const env = config.buildEnv(TEST_PASSWORD);
      assert.deepEqual(env, { PGPASSWORD: TEST_PASSWORD });
    });

    it("password does not appear in buildArgs", () => {
      const args = config.buildArgs(connection);
      assert.ok(!args.includes(TEST_PASSWORD), "Password must not appear in args");
    });

    it("buildStdin is undefined", () => {
      assert.equal(config.buildStdin, undefined);
    });
  });
});
