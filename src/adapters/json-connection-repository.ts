import fs from "node:fs/promises";
import { z } from "zod";
import type { Environment } from "../core/domain/connection.js";

const CURRENT_VERSION = 2;

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
  // partialRecord: not every environment needs an entry (zod v4 makes z.record with an enum key exhaustive by default).
  environments: z.partialRecord(environmentEnum, connectionEntrySchema),
});

const connectionsMapSchema = z.record(z.string(), connectionGroupSchema);
type ConnectionsMap = z.infer<typeof connectionsMapSchema>;

// v2 on-disk format: a versioned envelope wrapping the connections map.
const connectionsFileSchema = z.object({
  version: z.literal(CURRENT_VERSION),
  connections: connectionsMapSchema,
});
type ConnectionsFile = z.infer<typeof connectionsFileSchema>;

// A connection read from the legacy JSON store, before ids existed.
// The (name, environment) pair was the identity back then.
export type LegacyConnection = {
  name: string;
  engine: "mssql" | "oracle" | "mariadb" | "postgres";
  host: string;
  port: number;
  database: string;
  environment: Environment;
  readOnly?: boolean;
  options?: Record<string, string>;
};

// Read-only reader for the legacy connections.json format (v0/v1/v2).
// Used exclusively by migrate-json-to-sqlite.ts to import existing data
// into SQLite — once migrated, this format is never written again.
export class JsonConnectionRepository {
  constructor(private readonly filePath: string) {}

  async list(): Promise<LegacyConnection[]> {
    const file = await this.loadFile();
    const connections: LegacyConnection[] = [];
    for (const [name, group] of Object.entries(file.connections)) {
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

  private async loadFile(): Promise<ConnectionsFile> {
    let raw: string;
    try {
      raw = await fs.readFile(this.filePath, "utf-8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return { version: CURRENT_VERSION, connections: {} };
      }
      throw error;
    }
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return this.migrateIfNeeded(parsed);
  }

  // Deterministic version-by-version migration chain: v0 (legacy flat map) ->
  // v1 (nested map, no envelope) -> v2 (versioned envelope, current).
  // Idempotent: running it again on an already-migrated file is a no-op.
  // This only migrates the in-memory shape for reading — it does not write
  // back to connections.json (that file is retired after the sqlite import).
  private async migrateIfNeeded(parsed: Record<string, unknown>): Promise<ConnectionsFile> {
    const detectedVersion = this.detectVersion(parsed);

    if (detectedVersion === CURRENT_VERSION) {
      return connectionsFileSchema.parse(parsed);
    }

    let connections: ConnectionsMap;
    if (detectedVersion === 0) {
      connections = this.migrateV0ToV1(parsed);
    } else {
      connections = connectionsMapSchema.parse(parsed);
    }

    return { version: CURRENT_VERSION, connections };
  }

  private detectVersion(parsed: Record<string, unknown>): 0 | 1 | 2 {
    if ("version" in parsed && "connections" in parsed) {
      return 2;
    }
    // v0 (legacy flat): top-level values have "engine" directly (not nested under "environments")
    const firstValue = Object.values(parsed)[0];
    const isFlat =
      firstValue !== null &&
      typeof firstValue === "object" &&
      "engine" in (firstValue as object) &&
      !("environments" in (firstValue as object));
    return isFlat ? 0 : 1;
  }

  private migrateV0ToV1(parsed: Record<string, unknown>): ConnectionsMap {
    const oldMap = parsed as Record<
      string,
      { name: string; engine: string; environment: string; host: string; port: number; database: string; readOnly?: boolean; options?: Record<string, string> }
    >;
    const newConnections: ConnectionsMap = {};
    for (const connection of Object.values(oldMap)) {
      const { engine, environment, host, port, database, readOnly, options } = connection;
      const entry = { host, port, database, ...(readOnly !== undefined ? { readOnly } : {}), ...(options ? { options } : {}) };
      if (!newConnections[connection.name]) {
        newConnections[connection.name] = { engine: engine as ConnectionsMap[string]["engine"], environments: {} };
      }
      newConnections[connection.name].environments[environment as Environment] = entry;
    }
    return newConnections;
  }
}

export async function jsonConnectionsFileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
