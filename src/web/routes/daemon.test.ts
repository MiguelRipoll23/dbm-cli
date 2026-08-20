import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Connection, ConnectionListQuery, ConnectionListResult } from "../../core/domain/connection.js";
import type { ConnectionRepository } from "../../core/ports/connection-repository.js";
import type { CredentialStore } from "../../core/ports/credential-store.js";
import { ConnectionService } from "../../core/services/connection-service.js";
import { buildApp } from "../app.js";
import { PasswordCache } from "../password-cache.js";

class InMemoryConnectionRepository implements ConnectionRepository {
  private readonly store = new Map<string, Connection>();
  async list(_query: ConnectionListQuery = {}): Promise<ConnectionListResult> {
    const items = Array.from(this.store.values());
    return { items, total: items.length, page: 1, pageSize: items.length };
  }
  async getById(id: string): Promise<Connection | undefined> {
    return this.store.get(id);
  }
  async getByName(name: string, environment: string): Promise<Connection | undefined> {
    return Array.from(this.store.values()).find((c) => c.name === name && c.environment === environment);
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

const testConnection: Connection = {
  id: randomUUID(),
  name: "orders-db",
  engine: "postgres",
  host: "db.example.com",
  port: 5432,
  database: "orders",
  environment: "development",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function makeDaemonTestApp(onShutdownRequest: () => void = () => {}) {
  const repository = new InMemoryConnectionRepository();
  const connectionService = new ConnectionService(repository);
  const credentialStore = new InMemoryCredentialStore();
  const cache = new PasswordCache();
  const built = buildApp(connectionService, credentialStore, undefined, onShutdownRequest, {
    cache,
    startedAt: Date.now() - 1000,
    baseUrl: "http://127.0.0.1:4320",
  });
  return { ...built, cache };
}

describe("daemon routes — health", () => {
  it("reports pid, uptime, and cached count", async () => {
    const { app, token, cache } = makeDaemonTestApp();
    cache.set(testConnection.id, { username: "app", password: "s3cret" });

    const res = await app.request("/api/daemon/health", { headers: { "x-dbm-cli-token": token } });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { pid: number; uptimeMs: number; cachedCount: number };
    assert.equal(body.pid, process.pid);
    assert.equal(body.cachedCount, 1);
    assert.ok(body.uptimeMs >= 1000);
  });

  it("requires the session token", async () => {
    const { app } = makeDaemonTestApp();
    const res = await app.request("/api/daemon/health");
    assert.equal(res.status, 401);
  });
});

describe("daemon routes — credentials/resolve (cache hit)", () => {
  it("returns the cached credential without touching the unlock broker", async () => {
    const { app, token, cache } = makeDaemonTestApp();
    cache.set(testConnection.id, { username: "app", password: "s3cret" });

    const res = await app.request("/api/daemon/credentials/resolve", {
      method: "POST",
      headers: { "content-type": "application/json", "x-dbm-cli-token": token },
      body: JSON.stringify(testConnection),
    });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { username: "app", password: "s3cret" });
  });

  it("rejects a malformed connection body with 400", async () => {
    const { app, token } = makeDaemonTestApp();
    const res = await app.request("/api/daemon/credentials/resolve", {
      method: "POST",
      headers: { "content-type": "application/json", "x-dbm-cli-token": token },
      body: JSON.stringify({ not: "a connection" }),
    });
    assert.equal(res.status, 400);
  });
});

describe("daemon routes — credentials/prime (bulk)", () => {
  it("caches every credential so any connection resolves without the browser", async () => {
    const { app, token, cache } = makeDaemonTestApp();
    const map = {
      "conn-a": { username: "a", password: "pa" },
      "conn-b": { username: "b", password: "pb" },
    };

    const res = await app.request("/api/daemon/credentials/prime", {
      method: "POST",
      headers: { "content-type": "application/json", "x-dbm-cli-token": token },
      body: JSON.stringify(map),
    });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { cachedCount: 2 });
    assert.equal(cache.get("conn-a")?.password, "pa");
    assert.equal(cache.get("conn-b")?.password, "pb");
  });

  it("mirrors the vault: a re-prime drops credentials no longer present", async () => {
    const { app, token, cache } = makeDaemonTestApp();
    const headers = { "content-type": "application/json", "x-dbm-cli-token": token };

    await app.request("/api/daemon/credentials/prime", {
      method: "POST",
      headers,
      body: JSON.stringify({ "conn-a": { username: "a", password: "pa" }, "conn-b": { username: "b", password: "pb" } }),
    });
    assert.equal(cache.size, 2);

    // "conn-b" deleted in the web UI -> next prime omits it.
    const res = await app.request("/api/daemon/credentials/prime", {
      method: "POST",
      headers,
      body: JSON.stringify({ "conn-a": { username: "a", password: "pa" } }),
    });
    assert.deepEqual(await res.json(), { cachedCount: 1 });
    assert.equal(cache.get("conn-b"), undefined);
  });

  it("rejects a malformed prime body with 400", async () => {
    const { app, token } = makeDaemonTestApp();
    const res = await app.request("/api/daemon/credentials/prime", {
      method: "POST",
      headers: { "content-type": "application/json", "x-dbm-cli-token": token },
      body: JSON.stringify({ "conn-a": { username: "a" } }),
    });
    assert.equal(res.status, 400);
  });
});

describe("daemon routes — shutdown", () => {
  it("clears the cache and invokes onShutdownRequest, distinct from /api/shutdown", async () => {
    let daemonShutdownRequested = false;
    const { app, token, cache } = makeDaemonTestApp(() => {
      daemonShutdownRequested = true;
    });
    cache.set(testConnection.id, { username: "app", password: "s3cret" });

    const res = await app.request("/api/daemon/shutdown", {
      method: "POST",
      headers: { "x-dbm-cli-token": token },
    });
    assert.equal(res.status, 204);

    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(daemonShutdownRequested, true);
    assert.equal(cache.size, 0);
  });

  it("the browser-facing /api/shutdown is a no-op in daemon mode", async () => {
    let daemonShutdownRequested = false;
    const { app, token } = makeDaemonTestApp(() => {
      daemonShutdownRequested = true;
    });

    const res = await app.request("/api/shutdown", {
      method: "POST",
      headers: { "x-dbm-cli-token": token },
    });
    assert.equal(res.status, 204);

    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(daemonShutdownRequested, false, "a stray browser tab must not shut down the daemon");
  });
});
