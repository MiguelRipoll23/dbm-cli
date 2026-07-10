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

  async getById(id: string): Promise<Connection | undefined> {
    return this.store.get(id);
  }

  async getByName(name: string, environment: string): Promise<Connection | undefined> {
    return Array.from(this.store.values()).find(
      (c) => c.name.toLowerCase() === name.toLowerCase() && c.environment === environment,
    );
  }

  async save(connection: Connection): Promise<void> {
    this.store.set(connection.id, connection);
  }

  async remove(id: string): Promise<void> {
    this.store.delete(id);
  }
}

function makeConnection(name: string, environment: Connection["environment"] = "development"): Omit<Connection, "id"> {
  return {
    name,
    engine: "postgres",
    host: "localhost",
    port: 5432,
    database: "mydb",
    environment,
  };
}

describe("ConnectionService", () => {
  it("list returns all connections", async () => {
    const repository = new InMemoryConnectionRepository();
    const service = new ConnectionService(repository);

    await service.create(makeConnection("alpha"));
    await service.create(makeConnection("beta"));

    const connections = await service.list();
    assert.equal(connections.length, 2);
    const names = connections.map((c) => c.name);
    assert.ok(names.includes("alpha"));
    assert.ok(names.includes("beta"));
  });

  it("create saves a new connection and assigns an id", async () => {
    const repository = new InMemoryConnectionRepository();
    const service = new ConnectionService(repository);

    const created = await service.create(makeConnection("my-db"));
    assert.ok(created.id);

    const found = await repository.getById(created.id);
    assert.deepEqual(found, created);
  });

  it("create allows same name in different environments (distinct ids)", async () => {
    const repository = new InMemoryConnectionRepository();
    const service = new ConnectionService(repository);

    const dev = await service.create(makeConnection("my-db", "development"));
    const prod = await service.create(makeConnection("my-db", "production"));

    assert.notEqual(dev.id, prod.id);
  });

  it("create allows the same name with a different engine per environment (flat model)", async () => {
    const repository = new InMemoryConnectionRepository();
    const service = new ConnectionService(repository);

    await service.create(makeConnection("my-db", "development"));
    const mssqlConnection: Omit<Connection, "id"> = { ...makeConnection("my-db", "production"), engine: "mssql" };

    const created = await service.create(mssqlConnection);
    assert.equal(created.engine, "mssql");
  });

  it("create throws if (name, environment) already exists", async () => {
    const repository = new InMemoryConnectionRepository();
    const service = new ConnectionService(repository);

    await service.create(makeConnection("existing", "development"));

    await assert.rejects(
      () => service.create(makeConnection("existing", "development")),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.message, `Connection "existing" in environment "development" already exists`);
        return true;
      },
    );
  });

  it("update merges partial fields", async () => {
    const repository = new InMemoryConnectionRepository();
    const service = new ConnectionService(repository);

    const created = await service.create(makeConnection("prod", "production"));

    const updated = await service.update(created.id, { host: "prod-server.example.com", port: 5433 });

    assert.equal(updated.host, "prod-server.example.com");
    assert.equal(updated.port, 5433);
    assert.equal(updated.name, "prod");
    assert.equal(updated.engine, "postgres");
    assert.equal(updated.id, created.id);
  });

  it("update can rename, and can change engine/environment — anything but id", async () => {
    const repository = new InMemoryConnectionRepository();
    const service = new ConnectionService(repository);

    const created = await service.create(makeConnection("old-name", "development"));

    const updated = await service.update(created.id, { name: "new-name", engine: "mssql", environment: "staging" });

    assert.equal(updated.id, created.id);
    assert.equal(updated.name, "new-name");
    assert.equal(updated.engine, "mssql");
    assert.equal(updated.environment, "staging");
    assert.equal(await repository.getByName("old-name", "development"), undefined);
  });

  it("update throws if connection not found", async () => {
    const repository = new InMemoryConnectionRepository();
    const service = new ConnectionService(repository);

    await assert.rejects(
      () => service.update("nonexistent-id", { host: "other" }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.message, `Connection "nonexistent-id" not found`);
        return true;
      },
    );
  });

  it("update throws if renaming collides with another connection's (name, environment)", async () => {
    const repository = new InMemoryConnectionRepository();
    const service = new ConnectionService(repository);

    await service.create(makeConnection("alpha", "development"));
    const beta = await service.create(makeConnection("beta", "development"));

    await assert.rejects(
      () => service.update(beta.id, { name: "alpha" }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.message, `Connection "alpha" in environment "development" already exists`);
        return true;
      },
    );
  });

  it("update throws if the new name is invalid", async () => {
    const repository = new InMemoryConnectionRepository();
    const service = new ConnectionService(repository);

    const created = await service.create(makeConnection("alpha", "development"));

    await assert.rejects(() => service.update(created.id, { name: "-bad-name-" }));
  });

  it("delete removes the connection", async () => {
    const repository = new InMemoryConnectionRepository();
    const service = new ConnectionService(repository);

    const created = await service.create(makeConnection("to-delete", "staging"));

    await service.delete(created.id);

    assert.equal(await repository.getById(created.id), undefined);
  });

  it("delete throws if connection not found", async () => {
    const repository = new InMemoryConnectionRepository();
    const service = new ConnectionService(repository);

    await assert.rejects(
      () => service.delete("missing-id"),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.message, `Connection "missing-id" not found`);
        return true;
      },
    );
  });
});
