import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Connection } from "../domain/connection.js";
import type { ConnectionRepository } from "../ports/connection-repository.js";
import { ConnectionService } from "./connection-service.js";

class InMemoryConnectionRepository implements ConnectionRepository {
  private readonly store = new Map<string, Connection>();

  private key(name: string, environment: string): string {
    return `${name}:${environment}`;
  }

  async list(): Promise<Connection[]> {
    return Array.from(this.store.values());
  }

  async get(name: string, environment: string): Promise<Connection | undefined> {
    return this.store.get(this.key(name, environment));
  }

  async save(connection: Connection): Promise<void> {
    this.store.set(this.key(connection.name, connection.environment), connection);
  }

  async remove(name: string, environment: string): Promise<void> {
    const k = this.key(name, environment);
    if (!this.store.has(k)) {
      throw new Error(`Connection "${name}" in environment "${environment}" not found`);
    }
    this.store.delete(k);
  }
}

function makeConnection(name: string, environment: Connection["environment"] = "development"): Connection {
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

    const found = await repository.get("my-db", "development");
    assert.deepEqual(found, connection);
  });

  it("create allows same name in different environments", async () => {
    const repository = new InMemoryConnectionRepository();
    const service = new ConnectionService(repository);

    await service.create(makeConnection("my-db", "development"));
    await service.create(makeConnection("my-db", "production"));

    const dev = await repository.get("my-db", "development");
    const prod = await repository.get("my-db", "production");
    assert.ok(dev !== undefined);
    assert.ok(prod !== undefined);
  });

  it("create throws if (name, environment) already exists", async () => {
    const repository = new InMemoryConnectionRepository();
    const service = new ConnectionService(repository);

    await repository.save(makeConnection("existing", "development"));

    await assert.rejects(
      () => service.create(makeConnection("existing", "development")),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.message, `Connection "existing" in environment "development" already exists`);
        return true;
      },
    );
  });

  it("create throws if same name used with different engine", async () => {
    const repository = new InMemoryConnectionRepository();
    const service = new ConnectionService(repository);

    await repository.save(makeConnection("my-db", "development")); // engine: postgres

    const mssqlConnection: Connection = { ...makeConnection("my-db", "production"), engine: "mssql" };
    await assert.rejects(
      () => service.create(mssqlConnection),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.ok(error.message.includes("already uses engine"));
        return true;
      },
    );
  });

  it("update merges partial fields", async () => {
    const repository = new InMemoryConnectionRepository();
    const service = new ConnectionService(repository);

    await repository.save(makeConnection("prod", "production"));

    await service.update("prod", "production", { host: "prod-server.example.com", port: 5433 });

    const updated = await repository.get("prod", "production");
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
      () => service.update("nonexistent", "development", { host: "other" }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.message, `Connection "nonexistent" in environment "development" not found`);
        return true;
      },
    );
  });

  it("delete removes the connection", async () => {
    const repository = new InMemoryConnectionRepository();
    const service = new ConnectionService(repository);

    await repository.save(makeConnection("to-delete", "staging"));

    await service.delete("to-delete", "staging");

    const found = await repository.get("to-delete", "staging");
    assert.equal(found, undefined);
  });

  it("delete throws if connection not found", async () => {
    const repository = new InMemoryConnectionRepository();
    const service = new ConnectionService(repository);

    await assert.rejects(
      () => service.delete("missing", "development"),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.message, `Connection "missing" in environment "development" not found`);
        return true;
      },
    );
  });
});
