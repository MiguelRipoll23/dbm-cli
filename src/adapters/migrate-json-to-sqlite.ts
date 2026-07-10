import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import consola from "consola";
import { JsonConnectionRepository, jsonConnectionsFileExists } from "./json-connection-repository.js";
import { SqliteConnectionRepository } from "./sqlite-connection-repository.js";

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

// One-time, idempotent migration from the legacy connections.json store to
// SQLite. Runs at CLI startup (see index.ts). Safe to call on every launch:
// if connections.db already exists, this is a no-op — the migration only
// ever runs once per machine.
//
// On success, connections.json is renamed to connections.json.bak (backup,
// never deleted) and a "name:environment" -> uuid rekey map is written so
// the web UI can re-key the encrypted credentials vault (which is keyed by
// connection id from now on, not by name — see credentials rekey endpoint).
export async function migrateJsonToSqlite(jsonPath: string, dbPath: string, rekeyMapPath: string): Promise<void> {
  if (await fileExists(dbPath)) {
    return; // already migrated
  }
  if (!(await jsonConnectionsFileExists(jsonPath))) {
    return; // fresh install, nothing to migrate
  }

  consola.info(`Migrating connections from ${jsonPath} to SQLite (${dbPath}) ...`);

  const legacyReader = new JsonConnectionRepository(jsonPath);
  const legacyConnections = await legacyReader.list();

  const repo = new SqliteConnectionRepository(dbPath);
  const rekeyMap: Record<string, string> = {};

  for (const connection of legacyConnections) {
    const id = randomUUID();
    await repo.save({ ...connection, id });
    rekeyMap[`${connection.name}:${connection.environment}`] = id;
  }
  // Close before the caller opens its own long-lived repository on the same
  // file — Windows holds an exclusive lock on an open sqlite file.
  repo.close();

  await fs.writeFile(rekeyMapPath, JSON.stringify(rekeyMap, null, 2));

  const originalContents = await fs.readFile(jsonPath, "utf-8");
  await fs.writeFile(`${jsonPath}.bak`, originalContents);
  await fs.rm(jsonPath);

  consola.success(`Migrated ${legacyConnections.length} connection(s). Original file backed up to ${jsonPath}.bak`);
}
