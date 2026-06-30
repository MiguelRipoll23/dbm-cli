import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Connection } from "../domain/connection.js";
import type { ConnectionRepository } from "../ports/connection-repository.js";
import { ConnectionService } from "./connection-service.js";

class InMemoryConnectionRepository implements ConnectionRepository {
  private readonly store = new Map<string, Connection>();

  async list(): Promise<Connection[]> {
    return Array.from(this.store.values());
  }

  async get(name: string): Promise<Connection | undefined> {
    return this.store.get(name);
  }

  async save(connection: Connection): Promise<void> {
    this.store.set(connection.name, connection);
  }

  async remove(name: string): Promise<void> {
    if (!this.store.has(name)) {
      throw new Error(`Connection "${name}" not found`);
    }
    this.store.delete(name);
  }
}

function makeConnection(name: string): Connection {
  return {
    name,
    engine: "postgres",
    host: "localhost",
    port: 5432,
    database: "mydb",
    username: "admin",
    keepass: {
      databasePath: "/path/to/db.kdbx",
      entryPath: "db-cli/mydb",
    },
  };
}

describe("ConnectionService", () => {
  it("list returns all connections", async () => {
    const repository = new InMemoryConnectionRepository();
    const service = new ConnectionService(repository);

    await repository.save(makeConnection("alpha"));
    await repository.save(makeConnection("beta"));

    const connections = await service.list();
    assert.equal(connections.length, 2);
    const names = connections.map((c) => c.name);
    assert.ok(names.includes("alpha"));
    assert.ok(names.includes("beta"));
  });

  it("create saves a new connection", async () => {
    const repository = new InMemoryConnectionRepository();
    const service = new ConnectionService(repository);

    const connection = makeConnection("my-db");
    await service.create(connection);

    const found = await repository.get("my-db");
    assert.deepEqual(found, connection);
  });

  it("create throws if name already exists", async () => {
    const repository = new InMemoryConnectionRepository();
    const service = new ConnectionService(repository);

    await repository.save(makeConnection("existing"));

    await assert.rejects(
      () => service.create(makeConnection("existing")),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.message, `Connection "existing" already exists`);
        return true;
      },
    );
  });

  it("update merges partial fields", async () => {
    const repository = new InMemoryConnectionRepository();
    const service = new ConnectionService(repository);

    await repository.save(makeConnection("prod"));

    await service.update("prod", { host: "prod-server.example.com", port: 5433 });

    const updated = await repository.get("prod");
    assert.ok(updated !== undefined);
    assert.equal(updated.host, "prod-server.example.com");
    assert.equal(updated.port, 5433);
    assert.equal(updated.name, "prod");
    assert.equal(updated.engine, "postgres");
  });

  it("update throws if connection not found", async () => {
    const repository = new InMemoryConnectionRepository();
    const service = new ConnectionService(repository);

    await assert.rejects(
      () => service.update("nonexistent", { host: "other" }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.message, `Connection "nonexistent" not found`);
        return true;
      },
    );
  });

  it("delete removes the connection", async () => {
    const repository = new InMemoryConnectionRepository();
    const service = new ConnectionService(repository);

    await repository.save(makeConnection("to-delete"));

    await service.delete("to-delete");

    const found = await repository.get("to-delete");
    assert.equal(found, undefined);
  });

  it("delete throws if connection not found", async () => {
    const repository = new InMemoryConnectionRepository();
    const service = new ConnectionService(repository);

    await assert.rejects(
      () => service.delete("missing"),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.message, `Connection "missing" not found`);
        return true;
      },
    );
  });
});
