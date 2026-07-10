import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Connection } from "../core/domain/connection.js";
import type { ConnectionRepository } from "../core/ports/connection-repository.js";
import type { CredentialStore } from "../core/ports/credential-store.js";
import { ConnectionService } from "../core/services/connection-service.js";
import { buildApp } from "./app.js";

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

class InMemoryCredentialStore implements CredentialStore {
  private envelope: string | undefined;
  async readEnvelope(): Promise<string | undefined> {
    return this.envelope;
  }
  async writeEnvelope(envelopeJson: string): Promise<void> {
    this.envelope = envelopeJson;
  }
  async exists(): Promise<boolean> {
    return this.envelope !== undefined;
  }
}

function makeTestApp() {
  const repository = new InMemoryConnectionRepository();
  const connectionService = new ConnectionService(repository);
  const credentialStore = new InMemoryCredentialStore();
  return buildApp(connectionService, credentialStore);
}

const validConnection = {
  name: "orders-db",
  engine: "postgres" as const,
  host: "db.example.com",
  port: 5432,
  database: "orders",
  environment: "development" as const,
};

describe("web API — auth middleware", () => {
  it("rejects requests without the session token", async () => {
    const { app } = makeTestApp();
    const res = await app.request("/api/connections");
    assert.equal(res.status, 401);
  });

  it("rejects requests with the wrong token", async () => {
    const { app } = makeTestApp();
    const res = await app.request("/api/connections", { headers: { "x-db-cli-token": "wrong" } });
    assert.equal(res.status, 401);
  });
});

describe("web API — connections CRUD + zod validation", () => {
  it("rejects an invalid POST body with 400 and a standardized error shape", async () => {
    const { app, token } = makeTestApp();
    const res = await app.request("/api/connections", {
      method: "POST",
      headers: { "content-type": "application/json", "x-db-cli-token": token },
      body: JSON.stringify({ name: "bad", engine: "not-a-real-engine" }),
    });
    assert.equal(res.status, 400);
    const body = (await res.json()) as { error: { code: string; message: string } };
    assert.equal(body.error.code, "VALIDATION_ERROR");
  });

  it("accepts a valid POST body, generates an id, and returns 201", async () => {
    const { app, token } = makeTestApp();
    const res = await app.request("/api/connections", {
      method: "POST",
      headers: { "content-type": "application/json", "x-db-cli-token": token },
      body: JSON.stringify(validConnection),
    });
    assert.equal(res.status, 201);
    const created = (await res.json()) as Connection;
    assert.ok(created.id);
    assert.equal(created.name, "orders-db");
  });

  it("lists created connections", async () => {
    const { app, token } = makeTestApp();
    await app.request("/api/connections", {
      method: "POST",
      headers: { "content-type": "application/json", "x-db-cli-token": token },
      body: JSON.stringify(validConnection),
    });

    const res = await app.request("/api/connections", { headers: { "x-db-cli-token": token } });
    assert.equal(res.status, 200);
    const connections = (await res.json()) as Array<{ name: string }>;
    assert.equal(connections.length, 1);
    assert.equal(connections[0]!.name, "orders-db");
  });

  it("updates a connection by id, including name and engine", async () => {
    const { app, token } = makeTestApp();
    const createRes = await app.request("/api/connections", {
      method: "POST",
      headers: { "content-type": "application/json", "x-db-cli-token": token },
      body: JSON.stringify(validConnection),
    });
    const created = (await createRes.json()) as Connection;

    const updateRes = await app.request(`/api/connections/${created.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json", "x-db-cli-token": token },
      body: JSON.stringify({ name: "renamed-db", engine: "mssql" }),
    });
    assert.equal(updateRes.status, 200);
    const updated = (await updateRes.json()) as Connection;
    assert.equal(updated.id, created.id);
    assert.equal(updated.name, "renamed-db");
    assert.equal(updated.engine, "mssql");
  });

  it("returns 404 when updating a non-existent connection", async () => {
    const { app, token } = makeTestApp();
    const res = await app.request(`/api/connections/${randomUUID()}`, {
      method: "PUT",
      headers: { "content-type": "application/json", "x-db-cli-token": token },
      body: JSON.stringify({ host: "other" }),
    });
    assert.equal(res.status, 404);
  });

  it("returns 404 when deleting a non-existent connection", async () => {
    const { app, token } = makeTestApp();
    const res = await app.request(`/api/connections/${randomUUID()}`, {
      method: "DELETE",
      headers: { "x-db-cli-token": token },
    });
    assert.equal(res.status, 404);
  });
});

describe("web API — credentials envelope", () => {
  it("returns 404 before any envelope has been stored", async () => {
    const { app, token } = makeTestApp();
    const res = await app.request("/api/credentials/envelope", { headers: { "x-db-cli-token": token } });
    assert.equal(res.status, 404);
  });

  it("stores and retrieves an envelope opaquely", async () => {
    const { app, token } = makeTestApp();
    const envelope = {
      version: 1,
      kdf: { algorithm: "PBKDF2", hash: "SHA-256", iterations: 210000, salt: "c2FsdA==" },
      cipher: "AES-GCM",
      iv: "aXY=",
      ciphertext: "Y2lwaGVy",
    };
    const putRes = await app.request("/api/credentials/envelope", {
      method: "PUT",
      headers: { "content-type": "application/json", "x-db-cli-token": token },
      body: JSON.stringify(envelope),
    });
    assert.equal(putRes.status, 204);

    const getRes = await app.request("/api/credentials/envelope", { headers: { "x-db-cli-token": token } });
    assert.equal(getRes.status, 200);
    const stored = await getRes.json();
    assert.deepEqual(stored, envelope);
  });
});

describe("web API — unlock broker", () => {
  it("pending-unlock is null when nothing is waiting", async () => {
    const { app, token } = makeTestApp();
    const res = await app.request("/api/pending-unlock", { headers: { "x-db-cli-token": token } });
    assert.equal(res.status, 200);
    assert.equal(await res.json(), null);
  });

  it("resolve returns 404 for an unknown request id", async () => {
    const { app, token } = makeTestApp();
    const res = await app.request("/api/unlock-request/does-not-exist/resolve", {
      method: "POST",
      headers: { "content-type": "application/json", "x-db-cli-token": token },
      body: JSON.stringify({ username: "u", password: "p" }),
    });
    assert.equal(res.status, 404);
  });

  it("delivers a credential from resolve to the waiting broker.request() promise", async () => {
    const { app, token, broker } = makeTestApp();
    const connection: Connection = { ...validConnection, id: randomUUID() };
    const { id, promise } = broker.request(connection);

    const res = await app.request(`/api/unlock-request/${id}/resolve`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-db-cli-token": token },
      body: JSON.stringify({ username: "app", password: "s3cret" }),
    });
    assert.equal(res.status, 204);

    const credentials = await promise;
    assert.deepEqual(credentials, { username: "app", password: "s3cret" });
  });
});

describe("web API — shutdown", () => {
  it("returns 204 and invokes the onShutdownRequest callback", async () => {
    const repository = new InMemoryConnectionRepository();
    const connectionService = new ConnectionService(repository);
    const credentialStore = new InMemoryCredentialStore();
    let shutdownRequested = false;
    const { app, token } = buildApp(connectionService, credentialStore, undefined, () => {
      shutdownRequested = true;
    });

    const res = await app.request("/api/shutdown", {
      method: "POST",
      headers: { "x-db-cli-token": token },
    });
    assert.equal(res.status, 204);

    // The route defers the callback via setImmediate so the response can
    // flush first — wait a tick before asserting.
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(shutdownRequested, true);
  });

  it("rejects any pending unlock request with a clear message", async () => {
    const { app, token, broker } = makeTestApp();
    const connection: Connection = { ...validConnection, id: randomUUID() };
    const { promise } = broker.request(connection);

    const res = await app.request("/api/shutdown", {
      method: "POST",
      headers: { "x-db-cli-token": token },
    });
    assert.equal(res.status, 204);

    await assert.rejects(promise, /Web UI closed by the user\./);
  });

  it("requires the session token", async () => {
    const { app } = makeTestApp();
    const res = await app.request("/api/shutdown", { method: "POST" });
    assert.equal(res.status, 401);
  });
});
