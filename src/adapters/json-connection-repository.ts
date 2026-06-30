import fs from "node:fs/promises";
import path from "node:path";
import type { Connection } from "../core/domain/connection.js";
import { connectionsMapSchema } from "../core/domain/connection.js";
import type { ConnectionRepository } from "../core/ports/connection-repository.js";

export class JsonConnectionRepository implements ConnectionRepository {
  constructor(private readonly filePath: string) {}

  async list(): Promise<Connection[]> {
    let raw: string;
    try {
      raw = await fs.readFile(this.filePath, "utf-8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      throw error;
    }
    const map = connectionsMapSchema.parse(JSON.parse(raw));
    return Object.values(map);
  }

  async get(name: string): Promise<Connection | undefined> {
    const connections = await this.list();
    return connections.find((connection) => connection.name === name);
  }

  async save(connection: Connection): Promise<void> {
    const map = await this.loadMap();
    map[connection.name] = connection;
    connectionsMapSchema.parse(map);
    await this.writeMapAtomically(map);
  }

  async remove(name: string): Promise<void> {
    const map = await this.loadMap();
    if (!(name in map)) {
      throw new Error(`Connection "${name}" not found`);
    }
    delete map[name];
    await this.writeMapAtomically(map);
  }

  private async loadMap(): Promise<Record<string, Connection>> {
    let raw: string;
    try {
      raw = await fs.readFile(this.filePath, "utf-8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return {};
      }
      throw error;
    }
    return connectionsMapSchema.parse(JSON.parse(raw)) as Record<string, Connection>;
  }

  private async writeMapAtomically(map: Record<string, Connection>): Promise<void> {
    const directory = path.dirname(this.filePath);
    await fs.mkdir(directory, { recursive: true });
    const tmpPath = `${this.filePath}.tmp`;
    await fs.writeFile(tmpPath, JSON.stringify(map, null, 2));
    await fs.rename(tmpPath, this.filePath);
  }
}
