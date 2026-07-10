import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { JsonConnectionRepository } from "./json-connection-repository.js";

async function withTempFile(initialContent: string | undefined, fn: (filePath: string) => Promise<void>): Promise<void> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "db-cli-test-"));
  const filePath = path.join(dir, "connections.json");
  if (initialContent !== undefined) {
    await fs.writeFile(filePath, initialContent);
  }
  try {
    await fn(filePath);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

// JsonConnectionRepository is now a read-only reader for the legacy
// connections.json format, used only by migrate-json-to-sqlite.ts.
describe("JsonConnectionRepository (legacy reader)", () => {
  it("reads legacy v0 flat format", async () => {
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
    await withTempFile(JSON.stringify(v0), async (filePath) => {
      const repo = new JsonConnectionRepository(filePath);
      const connections = await repo.list();
      assert.equal(connections.length, 1);
      assert.equal(connections[0]!.name, "my-db");
      assert.equal(connections[0]!.host, "localhost");
    });
  });

  it("reads v1 nested format (no envelope)", async () => {
    const v1 = {
      "my-db": {
        engine: "postgres",
        environments: {
          development: { host: "localhost", port: 5432, database: "shop" },
        },
      },
    };
    await withTempFile(JSON.stringify(v1), async (filePath) => {
      const repo = new JsonConnectionRepository(filePath);
      const connections = await repo.list();
      assert.equal(connections.length, 1);
    });
  });

  it("treats a missing file as empty", async () => {
    await withTempFile(undefined, async (filePath) => {
      const repo = new JsonConnectionRepository(filePath);
      const connections = await repo.list();
      assert.deepEqual(connections, []);
    });
  });

  it("reads a v2 envelope with multiple environments", async () => {
    const v2 = {
      version: 2,
      connections: {
        alpha: {
          engine: "mariadb",
          environments: {
            development: { host: "h", port: 3306, database: "d" },
            production: { host: "h2", port: 3306, database: "d", readOnly: true },
          },
        },
      },
    };
    await withTempFile(JSON.stringify(v2), async (filePath) => {
      const repo = new JsonConnectionRepository(filePath);
      const connections = await repo.list();
      assert.equal(connections.length, 2);
      const prod = connections.find((c) => c.environment === "production")!;
      assert.equal(prod.readOnly, true);
    });
  });
});
