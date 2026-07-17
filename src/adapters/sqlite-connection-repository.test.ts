import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { SqliteConnectionRepository } from "./sqlite-connection-repository.js";

// Windows holds an exclusive lock on an open sqlite file, so the repo must be
// closed before the temp directory can be removed.
async function withTempRepo(fn: (repo: SqliteConnectionRepository) => Promise<void>): Promise<void> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "dbm-cli-sqlite-test-"));
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
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("SqliteConnectionRepository", () => {
  it("creates the schema lazily and starts empty", async () => {
    await withTempRepo(async (repo) => {
      assert.deepEqual(await repo.list(), { items: [], total: 0, page: 1, pageSize: 20 });
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

  it("list supports search across name, host, database (case-insensitive)", async () => {
    await withTempRepo(async (repo) => {
      await repo.save(makeConnection({ id: "11111111-1111-1111-1111-111111111111", name: "orders-db", host: "orders.internal", database: "orders" }));
      await repo.save(makeConnection({ id: "22222222-2222-2222-2222-222222222222", name: "billing-db", host: "billing.internal", database: "billing", environment: "staging" }));

      const byName = await repo.list({ search: "ORDERS" });
      assert.equal(byName.total, 1);
      assert.equal(byName.items[0]!.name, "orders-db");

      const byHost = await repo.list({ search: "billing.internal" });
      assert.equal(byHost.total, 1);
      assert.equal(byHost.items[0]!.name, "billing-db");

      const noMatch = await repo.list({ search: "nonexistent" });
      assert.equal(noMatch.total, 0);
    });
  });

  it("list sorts by name, createdAt, updatedAt in both directions", async () => {
    await withTempRepo(async (repo) => {
      await repo.save(makeConnection({ id: "11111111-1111-1111-1111-111111111111", name: "beta", createdAt: "2026-01-02T00:00:00.000Z", updatedAt: "2026-01-05T00:00:00.000Z" }));
      await repo.save(makeConnection({ id: "22222222-2222-2222-2222-222222222222", name: "alpha", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-06T00:00:00.000Z", environment: "staging" }));

      const byNameAsc = await repo.list({ sortBy: "name", sortDir: "asc" });
      assert.deepEqual(byNameAsc.items.map((c) => c.name), ["alpha", "beta"]);

      const byNameDesc = await repo.list({ sortBy: "name", sortDir: "desc" });
      assert.deepEqual(byNameDesc.items.map((c) => c.name), ["beta", "alpha"]);

      const byCreatedAsc = await repo.list({ sortBy: "createdAt", sortDir: "asc" });
      assert.deepEqual(byCreatedAsc.items.map((c) => c.name), ["alpha", "beta"]);

      const byUpdatedDesc = await repo.list({ sortBy: "updatedAt", sortDir: "desc" });
      assert.deepEqual(byUpdatedDesc.items.map((c) => c.name), ["alpha", "beta"]);
    });
  });

  it("list paginates with a stable total count across the filtered set", async () => {
    await withTempRepo(async (repo) => {
      for (let i = 0; i < 5; i++) {
        await repo.save(
          makeConnection({
            id: `1111111${i}-1111-1111-1111-11111111111${i}`,
            name: `db-${i}`,
            environment: i % 2 === 0 ? "development" : "staging",
          }),
        );
      }

      const page1 = await repo.list({ sortBy: "name", sortDir: "asc", page: 1, pageSize: 2 });
      assert.equal(page1.total, 5);
      assert.deepEqual(page1.items.map((c) => c.name), ["db-0", "db-1"]);

      const page3 = await repo.list({ sortBy: "name", sortDir: "asc", page: 3, pageSize: 2 });
      assert.equal(page3.total, 5);
      assert.deepEqual(page3.items.map((c) => c.name), ["db-4"]);
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
      assert.equal(all.items.length, 2);
      assert.equal(all.total, 2);
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
      assert.equal(all.items.length, 1);
      assert.equal(all.items[0]!.name, "renamed-db");
      assert.equal(all.items[0]!.engine, "mssql");
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
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "dbm-cli-sqlite-test-"));
    const dbPath = path.join(dir, "connections.db");
    try {
      const repo1 = new SqliteConnectionRepository(dbPath);
      await repo1.save(makeConnection());
      repo1.close();

      const repo2 = new SqliteConnectionRepository(dbPath);
      const all = await repo2.list();
      assert.equal(all.items.length, 1);
      repo2.close();
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("migrates a pre-timestamp table by adding and backfilling created_at/updated_at, idempotently", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "dbm-cli-sqlite-test-"));
    const dbPath = path.join(dir, "connections.db");
    try {
      // Simulate a database created before timestamps existed, by writing
      // directly through the old (columnless) shape via a raw DatabaseSync.
      const { DatabaseSync } = await import("node:sqlite");
      const legacyDb = new DatabaseSync(dbPath);
      legacyDb.exec(`
        CREATE TABLE connections (
          id          TEXT PRIMARY KEY,
          name        TEXT NOT NULL,
          engine      TEXT NOT NULL,
          host        TEXT NOT NULL,
          port        INTEGER NOT NULL,
          database    TEXT NOT NULL,
          environment TEXT NOT NULL,
          read_only   INTEGER NOT NULL DEFAULT 0,
          options     TEXT,
          UNIQUE (name COLLATE NOCASE, environment)
        )
      `);
      legacyDb
        .prepare(
          "INSERT INTO connections (id, name, engine, host, port, database, environment) VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .run("11111111-1111-1111-1111-111111111111", "legacy-db", "postgres", "localhost", 5432, "shop", "development");
      legacyDb.close();

      const repo1 = new SqliteConnectionRepository(dbPath);
      const migrated = await repo1.getById("11111111-1111-1111-1111-111111111111");
      assert.ok(migrated !== undefined);
      assert.ok(migrated.createdAt.length > 0);
      assert.ok(migrated.updatedAt.length > 0);
      repo1.close();

      // Re-opening (second migration pass) must be a no-op: no error, and
      // the backfilled timestamp from the first pass is preserved.
      const repo2 = new SqliteConnectionRepository(dbPath);
      const stillThere = await repo2.getById("11111111-1111-1111-1111-111111111111");
      assert.deepEqual(stillThere, migrated);
      repo2.close();
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
