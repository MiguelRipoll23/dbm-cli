import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { migrateJsonToSqlite } from "./migrate-json-to-sqlite.js";
import { SqliteConnectionRepository } from "./sqlite-connection-repository.js";

async function withTempDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "db-cli-migrate-test-"));
  try {
    await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

describe("migrateJsonToSqlite", () => {
  it("does nothing if the db already exists", async () => {
    await withTempDir(async (dir) => {
      const jsonPath = path.join(dir, "connections.json");
      const dbPath = path.join(dir, "connections.db");
      const rekeyPath = path.join(dir, "credential-rekey.json");
      await fs.writeFile(jsonPath, JSON.stringify({ version: 2, connections: {} }));
      await fs.writeFile(dbPath, ""); // pretend it's already migrated

      await migrateJsonToSqlite(jsonPath, dbPath, rekeyPath);

      const jsonStillThere = await fs.access(jsonPath).then(() => true, () => false);
      assert.equal(jsonStillThere, true); // untouched, not renamed to .bak
    });
  });

  it("does nothing if there is no connections.json to migrate", async () => {
    await withTempDir(async (dir) => {
      const jsonPath = path.join(dir, "connections.json");
      const dbPath = path.join(dir, "connections.db");
      const rekeyPath = path.join(dir, "credential-rekey.json");

      await migrateJsonToSqlite(jsonPath, dbPath, rekeyPath);

      const dbExists = await fs.access(dbPath).then(() => true, () => false);
      assert.equal(dbExists, false);
    });
  });

  it("migrates a v2 envelope into sqlite, writes a rekey map, and backs up the json", async () => {
    await withTempDir(async (dir) => {
      const jsonPath = path.join(dir, "connections.json");
      const dbPath = path.join(dir, "connections.db");
      const rekeyPath = path.join(dir, "credential-rekey.json");

      const v2 = {
        version: 2,
        connections: {
          "my-db": {
            engine: "postgres",
            environments: {
              development: { host: "localhost", port: 5432, database: "shop" },
              production: { host: "prod.example.com", port: 5432, database: "shop", readOnly: true },
            },
          },
        },
      };
      await fs.writeFile(jsonPath, JSON.stringify(v2));

      await migrateJsonToSqlite(jsonPath, dbPath, rekeyPath);

      const repo = new SqliteConnectionRepository(dbPath);
      const all = await repo.list();
      repo.close();
      assert.equal(all.length, 2);

      const dev = all.find((c) => c.environment === "development")!;
      const prod = all.find((c) => c.environment === "production")!;
      assert.equal(dev.name, "my-db");
      assert.equal(dev.host, "localhost");
      assert.equal(prod.readOnly, true);
      assert.ok(dev.id);
      assert.ok(prod.id);
      assert.notEqual(dev.id, prod.id);

      const rekeyMap = JSON.parse(await fs.readFile(rekeyPath, "utf-8")) as Record<string, string>;
      assert.equal(rekeyMap["my-db:development"], dev.id);
      assert.equal(rekeyMap["my-db:production"], prod.id);

      const jsonStillThere = await fs.access(jsonPath).then(() => true, () => false);
      assert.equal(jsonStillThere, false);
      const backup = await fs.readFile(`${jsonPath}.bak`, "utf-8");
      assert.deepEqual(JSON.parse(backup), v2);
    });
  });

  it("migrates a legacy v0 flat json too (reuses JsonConnectionRepository's migration chain)", async () => {
    await withTempDir(async (dir) => {
      const jsonPath = path.join(dir, "connections.json");
      const dbPath = path.join(dir, "connections.db");
      const rekeyPath = path.join(dir, "credential-rekey.json");

      const v0 = {
        "my-db": {
          name: "my-db",
          engine: "postgres",
          environment: "development",
          host: "localhost",
          port: 5432,
          database: "shop",
        },
      };
      await fs.writeFile(jsonPath, JSON.stringify(v0));

      await migrateJsonToSqlite(jsonPath, dbPath, rekeyPath);

      const repo = new SqliteConnectionRepository(dbPath);
      const all = await repo.list();
      repo.close();
      assert.equal(all.length, 1);
      assert.equal(all[0]!.name, "my-db");
    });
  });
});
