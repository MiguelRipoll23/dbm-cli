import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Connection, Engine, Environment } from "../core/domain/connection.js";
import type { ConnectionRepository } from "../core/ports/connection-repository.js";

type ConnectionRow = {
  id: string;
  name: string;
  engine: string;
  host: string;
  port: number;
  database: string;
  environment: string;
  read_only: number;
  options: string | null;
};

function rowToConnection(row: ConnectionRow): Connection {
  return {
    id: row.id,
    name: row.name,
    engine: row.engine as Engine,
    host: row.host,
    port: row.port,
    database: row.database,
    environment: row.environment as Environment,
    ...(row.read_only ? { readOnly: true } : {}),
    ...(row.options ? { options: JSON.parse(row.options) as Record<string, string> } : {}),
  };
}

export class SqliteConnectionRepository implements ConnectionRepository {
  private readonly db: DatabaseSync;

  constructor(filePath: string) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    this.db = new DatabaseSync(filePath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS connections (
        id          TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        engine      TEXT NOT NULL,
        host        TEXT NOT NULL,
        port        INTEGER NOT NULL,
        database    TEXT NOT NULL,
        environment TEXT NOT NULL,
        read_only   INTEGER NOT NULL DEFAULT 0,
        options     TEXT,
        UNIQUE (name COLLATE NOCASE, environment)
      )
    `);
  }

  async list(): Promise<Connection[]> {
    const rows = this.db.prepare("SELECT * FROM connections ORDER BY name, environment").all() as unknown as ConnectionRow[];
    return rows.map(rowToConnection);
  }

  async getById(id: string): Promise<Connection | undefined> {
    const row = this.db.prepare("SELECT * FROM connections WHERE id = ?").get(id) as unknown as ConnectionRow | undefined;
    return row ? rowToConnection(row) : undefined;
  }

  async getByName(name: string, environment: string): Promise<Connection | undefined> {
    const row = this.db
      .prepare("SELECT * FROM connections WHERE name = ? COLLATE NOCASE AND environment = ?")
      .get(name, environment) as unknown as ConnectionRow | undefined;
    return row ? rowToConnection(row) : undefined;
  }

  async save(connection: Connection): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO connections (id, name, engine, host, port, database, environment, read_only, options)
         VALUES (@id, @name, @engine, @host, @port, @database, @environment, @readOnly, @options)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           engine = excluded.engine,
           host = excluded.host,
           port = excluded.port,
           database = excluded.database,
           environment = excluded.environment,
           read_only = excluded.read_only,
           options = excluded.options`,
      )
      .run({
        id: connection.id,
        name: connection.name,
        engine: connection.engine,
        host: connection.host,
        port: connection.port,
        database: connection.database,
        environment: connection.environment,
        readOnly: connection.readOnly ? 1 : 0,
        options: connection.options ? JSON.stringify(connection.options) : null,
      });
  }

  async remove(id: string): Promise<void> {
    this.db.prepare("DELETE FROM connections WHERE id = ?").run(id);
  }

  /** Closes the underlying file handle. Windows holds an exclusive lock on
   * open sqlite files, so tests must call this before removing their temp
   * directory; the long-lived CLI process never needs to call it. */
  close(): void {
    this.db.close();
  }
}
