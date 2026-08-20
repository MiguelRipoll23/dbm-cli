import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { serve, type ServerType } from "@hono/node-server";
import type { Connection, ConnectionListQuery, ConnectionListResult } from "../core/domain/connection.js";
import type { ConnectionRepository } from "../core/ports/connection-repository.js";
import type { CredentialStore } from "../core/ports/credential-store.js";
import { ConnectionService } from "../core/services/connection-service.js";
import { buildApp } from "../web/app.js";
import { PasswordCache } from "../web/password-cache.js";
import { DaemonClient } from "./daemon-client.js";

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
  async readEnvelope(): Promise<string | undefined> {
    return undefined;
  }
  async writeEnvelope(): Promise<void> {}
  async exists(): Promise<boolean> {
    return false;
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

async function withDaemonServer(
  fn: (ctx: { baseUrl: string; token: string; cache: PasswordCache }) => Promise<void>,
): Promise<void> {
  const repository = new InMemoryConnectionRepository();
  const connectionService = new ConnectionService(repository);
  const credentialStore = new InMemoryCredentialStore();
  const cache = new PasswordCache();

  const { app, token } = buildApp(connectionService, credentialStore, undefined, () => {}, {
    cache,
    startedAt: Date.now(),
    baseUrl: "http://127.0.0.1:0",
  });

  const server = await new Promise<ServerType>((resolve) => {
    const s = serve({ fetch: app.fetch, hostname: "127.0.0.1", port: 0 }, () => resolve(s));
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    await fn({ baseUrl, token, cache });
  } finally {
    await new Promise((resolve) => server.close(() => resolve(undefined)));
  }
}

describe("DaemonClient.resolveCredentials", () => {
  it("returns the cached credential over a real HTTP connection", async () => {
    await withDaemonServer(async ({ baseUrl, token, cache }) => {
      cache.set(testConnection.id, { username: "app", password: "s3cret" });

      const client = new DaemonClient();
      const credentials = await client.resolveCredentials(baseUrl, token, testConnection);
      assert.deepEqual(credentials, { username: "app", password: "s3cret" });
    });
  });

  it("throws a readable error when the daemon rejects the request", async () => {
    await withDaemonServer(async ({ baseUrl }) => {
      const client = new DaemonClient();
      await assert.rejects(
        client.resolveCredentials(baseUrl, "wrong-token", testConnection),
        /Missing or invalid session token/,
      );
    });
  });
});
