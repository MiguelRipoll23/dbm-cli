import type { Connection } from "../domain/connection.js";
import { connectionSchema } from "../domain/connection.js";
import type { ConnectionRepository } from "../ports/connection-repository.js";

export class ConnectionService {
  constructor(private readonly repository: ConnectionRepository) {}

  async list(): Promise<Connection[]> {
    return this.repository.list();
  }

  async get(name: string, environment: string): Promise<Connection | undefined> {
    return this.repository.get(name, environment);
  }

  async create(connection: Connection): Promise<void> {
    const existing = await this.repository.get(connection.name, connection.environment);
    if (existing !== undefined) {
      throw new Error(`Connection "${connection.name}" in environment "${connection.environment}" already exists`);
    }
    // Engine must be consistent across all environments of the same name
    const all = await this.repository.list();
    const sibling = all.find((c) => c.name === connection.name);
    if (sibling !== undefined && sibling.engine !== connection.engine) {
      throw new Error(
        `Connection "${connection.name}" already uses engine "${sibling.engine}"; cannot create with engine "${connection.engine}"`,
      );
    }
    await this.repository.save(connection);
  }

  async update(name: string, environment: string, updates: Partial<Omit<Connection, "name" | "environment">>): Promise<void> {
    const existing = await this.repository.get(name, environment);
    if (existing === undefined) {
      throw new Error(`Connection "${name}" in environment "${environment}" not found`);
    }
    const merged = connectionSchema.parse({ ...existing, ...updates });
    await this.repository.save(merged);
  }

  async delete(name: string, environment: string): Promise<void> {
    const existing = await this.repository.get(name, environment);
    if (existing === undefined) {
      throw new Error(`Connection "${name}" in environment "${environment}" not found`);
    }
    await this.repository.remove(name, environment);
  }
}
