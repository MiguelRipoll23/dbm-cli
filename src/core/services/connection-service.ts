import { randomUUID } from "node:crypto";
import type { Connection, ConnectionListQuery, ConnectionListResult } from "../domain/connection.js";
import { connectionSchema } from "../domain/connection.js";
import type { ConnectionRepository } from "../ports/connection-repository.js";

export class ConnectionService {
  constructor(
    private readonly repository: ConnectionRepository,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  async list(query?: ConnectionListQuery): Promise<ConnectionListResult> {
    return this.repository.list(query);
  }

  async getById(id: string): Promise<Connection | undefined> {
    return this.repository.getById(id);
  }

  async getByName(name: string, environment: string): Promise<Connection | undefined> {
    return this.repository.getByName(name, environment);
  }

  async create(connection: Omit<Connection, "id" | "createdAt" | "updatedAt">): Promise<Connection> {
    const timestamp = this.now();
    const withId: Connection = { ...connection, id: randomUUID(), createdAt: timestamp, updatedAt: timestamp };
    connectionSchema.parse(withId);
    const existing = await this.repository.getByName(withId.name, withId.environment);
    if (existing !== undefined) {
      throw new Error(`Connection "${withId.name}" in environment "${withId.environment}" already exists`);
    }
    await this.repository.save(withId);
    return withId;
  }

  async update(id: string, updates: Partial<Omit<Connection, "id" | "createdAt" | "updatedAt">>): Promise<Connection> {
    const existing = await this.repository.getById(id);
    if (existing === undefined) {
      throw new Error(`Connection "${id}" not found`);
    }

    const merged = connectionSchema.parse({
      ...existing,
      ...updates,
      id,
      createdAt: existing.createdAt,
      updatedAt: this.now(),
    });

    if (merged.name !== existing.name || merged.environment !== existing.environment) {
      const collision = await this.repository.getByName(merged.name, merged.environment);
      if (collision !== undefined && collision.id !== id) {
        throw new Error(`Connection "${merged.name}" in environment "${merged.environment}" already exists`);
      }
    }

    await this.repository.save(merged);
    return merged;
  }

  async delete(id: string): Promise<void> {
    const existing = await this.repository.getById(id);
    if (existing === undefined) {
      throw new Error(`Connection "${id}" not found`);
    }
    await this.repository.remove(id);
  }
}
