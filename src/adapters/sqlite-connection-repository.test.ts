import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { SqliteConnectionRepository } from "./sqlite-connection-repository.js";

// Windows holds an exclusive lock on an open sqlite file, so the repo must be
// closed before the temp directory can be removed.
async function withTempRepo(fn: (repo: SqliteConnectionRepository) => Promise<void>): Promise<void> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "db-cli-sqlite-test-"));
  const dbPath = path.join(dir, "connections.db");
  const repo = new SqliteConnectionRepository(dbPath);
  try {
    await fn(repo);
  } finally {
    repo.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
}

function makeConnection(overrides: Partial<Parameters<SqliteConnectionRepository["save"]>[0]> = {}) {
  return {
    id: overrides.id ?? "11111111-1111-1111-1111-111111111111",
    name: "my-db",
    engine: "postgres" as const,
    host: "localhost",
    port: 5432,
    database: "shop",
    environment: "development" as const,
    ...overrides,
  };
}

describe("SqliteConnectionRepository", () => {
  it("creates the schema lazily and starts empty", async () => {
    await withTempRepo(async (repo) => {
      assert.deepEqual(await repo.list(), []);
    });
  });

  it("save then getById round-trips all fields", async () => {
    await withTempRepo(async (repo) => {
      const connection = makeConnection({ readOnly: true, options: { sslmode: "require" } });
      await repo.save(connection);

      const found = await repo.getById(connection.id);
      assert.deepEqual(found, connection);
    });
  });

  it("getByName is case-insensitive on name", async () => {
    await withTempRepo(async (repo) => {
      await repo.save(makeConnection({ name: "My-DB" }));

      const found = await repo.getByName("my-db", "development");
      assert.ok(found !== undefined);
      assert.equal(found.name, "My-DB");
    });
  });

  it("allows the same name in different environments as separate rows", async () => {
    await withTempRepo(async (repo) => {
      await repo.save(makeConnection({ id: "11111111-1111-1111-1111-111111111111", environment: "development" }));
      await repo.save(makeConnection({ id: "22222222-2222-2222-2222-222222222222", environment: "production" }));

      const all = await repo.list();
      assert.equal(all.length, 2);
    });
  });

  it("rejects a second row with the same (name, environment) — unique constraint", async () => {
    await withTempRepo(async (repo) => {
      await repo.save(makeConnection({ id: "11111111-1111-1111-1111-111111111111" }));

      await assert.rejects(() =>
        repo.save(makeConnection({ id: "22222222-2222-2222-2222-222222222222" })),
      );
    });
  });

  it("save with an existing id upserts (rename/edit in place, no collision with itself)", async () => {
    await withTempRepo(async (repo) => {
      const connection = makeConnection();
      await repo.save(connection);

      await repo.save({ ...connection, name: "renamed-db", engine: "mssql" });

      const all = await repo.list();
      assert.equal(all.length, 1);
      assert.equal(all[0]!.name, "renamed-db");
      assert.equal(all[0]!.engine, "mssql");
    });
  });

  it("remove deletes by id", async () => {
    await withTempRepo(async (repo) => {
      const connection = makeConnection();
      await repo.save(connection);

      await repo.remove(connection.id);

      assert.equal(await repo.getById(connection.id), undefined);
    });
  });

  it("data persists across repository instances (same file)", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "db-cli-sqlite-test-"));
    const dbPath = path.join(dir, "connections.db");
    try {
      const repo1 = new SqliteConnectionRepository(dbPath);
      await repo1.save(makeConnection());
      repo1.close();

      const repo2 = new SqliteConnectionRepository(dbPath);
      const all = await repo2.list();
      assert.equal(all.length, 1);
      repo2.close();
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
