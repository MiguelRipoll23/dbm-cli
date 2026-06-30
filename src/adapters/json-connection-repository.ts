import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { Connection, Environment } from "../core/domain/connection.js";
import type { ConnectionRepository } from "../core/ports/connection-repository.js";

const environmentEnum = z.enum(["development", "staging", "production", "local"]);

const connectionEntrySchema = z.object({
  host: z.string(),
  port: z.number().int().positive(),
  database: z.string(),
  readOnly: z.boolean().optional(),
  options: z.record(z.string(), z.string()).optional(),
});

const connectionGroupSchema = z.object({
  engine: z.enum(["mssql", "oracle", "mariadb", "postgres"]),
  environments: z.record(environmentEnum, connectionEntrySchema),
});

const connectionsFileSchema = z.record(z.string(), connectionGroupSchema);
type ConnectionsFile = z.infer<typeof connectionsFileSchema>;

export class JsonConnectionRepository implements ConnectionRepository {
  constructor(private readonly filePath: string) {}

  async list(): Promise<Connection[]> {
    const file = await this.loadFile();
    const connections: Connection[] = [];
    for (const [name, group] of Object.entries(file)) {
      for (const [environment, entry] of Object.entries(group.environments)) {
        connections.push({
          name,
          engine: group.engine,
          environment: environment as Environment,
          ...entry,
        });
      }
    }
    return connections;
  }

  async get(name: string, environment: string): Promise<Connection | undefined> {
    const file = await this.loadFile();
    const group = file[name];
    if (!group) return undefined;
    const entry = group.environments[environment as Environment];
    if (!entry) return undefined;
    return { name, engine: group.engine, environment: environment as Environment, ...entry };
  }

  async save(connection: Connection): Promise<void> {
    const { name, engine, environment, ...entry } = connection;
    const file = await this.loadFile();
    const existingGroup = file[name];
    const updatedFile: ConnectionsFile = {
      ...file,
      [name]: {
        engine,
        environments: {
          ...(existingGroup?.environments ?? {}),
          [environment]: entry,
        },
      },
    };
    connectionsFileSchema.parse(updatedFile);
    await this.writeFileAtomically(updatedFile);
  }

  async remove(name: string, environment: string): Promise<void> {
    const file = await this.loadFile();
    const group = file[name];
    if (!group?.environments[environment as Environment]) {
      throw new Error(`Connection "${name}" in environment "${environment}" not found`);
    }
    const remainingEnvs = { ...group.environments };
    delete remainingEnvs[environment as Environment];
    const updatedFile: ConnectionsFile = { ...file };
    if (Object.keys(remainingEnvs).length === 0) {
      delete updatedFile[name];
    } else {
      updatedFile[name] = { engine: group.engine, environments: remainingEnvs };
    }
    await this.writeFileAtomically(updatedFile);
  }

  private async loadFile(): Promise<ConnectionsFile> {
    let raw: string;
    try {
      raw = await fs.readFile(this.filePath, "utf-8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return {};
      }
      throw error;
    }
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return this.migrateIfNeeded(parsed);
  }

  private async migrateIfNeeded(parsed: Record<string, unknown>): Promise<ConnectionsFile> {
    // Detect old flat format: top-level values have "engine" directly (not nested under "environments")
    const firstValue = Object.values(parsed)[0];
    const isOldFormat =
      firstValue !== null &&
      typeof firstValue === "object" &&
      "engine" in (firstValue as object) &&
      !("environments" in (firstValue as object));

    if (isOldFormat) {
      // Old format: { [name]: { name, engine, environment, host, port, database, ... } }
      const oldMap = parsed as Record<string, { name: string; engine: string; environment: string; host: string; port: number; database: string; readOnly?: boolean; options?: Record<string, string> }>;
      const newFile: ConnectionsFile = {};
      for (const connection of Object.values(oldMap)) {
        const { engine, environment, host, port, database, readOnly, options } = connection;
        const entry = { host, port, database, ...(readOnly !== undefined ? { readOnly } : {}), ...(options ? { options } : {}) };
        if (!newFile[connection.name]) {
          newFile[connection.name] = { engine: engine as Connection["engine"], environments: {} };
        }
        newFile[connection.name].environments[environment as Environment] = entry;
      }
      await this.writeFileAtomically(newFile);
      return newFile;
    }

    return connectionsFileSchema.parse(parsed);
  }

  private async writeFileAtomically(file: ConnectionsFile): Promise<void> {
    const directory = path.dirname(this.filePath);
    await fs.mkdir(directory, { recursive: true });
    const tmpPath = `${this.filePath}.tmp`;
    await fs.writeFile(tmpPath, JSON.stringify(file, null, 2));
    await fs.rename(tmpPath, this.filePath);
  }
}
