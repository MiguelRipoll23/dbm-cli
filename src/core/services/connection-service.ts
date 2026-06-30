import type { Connection } from "../domain/connection.js";
import { connectionSchema } from "../domain/connection.js";
import type { ConnectionRepository } from "../ports/connection-repository.js";

export class ConnectionService {
  constructor(private readonly repository: ConnectionRepository) {}

  async list(): Promise<Connection[]> {
    return this.repository.list();
  }

  async create(connection: Connection): Promise<void> {
    const existing = await this.repository.get(connection.name);
    if (existing !== undefined) {
      throw new Error(`Connection "${connection.name}" already exists`);
    }
    await this.repository.save(connection);
  }

  async update(name: string, updates: Partial<Omit<Connection, "name">>): Promise<void> {
    const existing = await this.repository.get(name);
    if (existing === undefined) {
      throw new Error(`Connection "${name}" not found`);
    }
    const merged = connectionSchema.parse({ ...existing, ...updates });
    await this.repository.save(merged);
  }

  async delete(name: string): Promise<void> {
    await this.repository.remove(name);
  }
}
