import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type {
  Connection,
  ConnectionListQuery,
  ConnectionListResult,
  Engine,
  Environment,
} from "../core/domain/connection.js";
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
  created_at: string;
  updated_at: string;
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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Whitelisted so query.sortBy/sortDir can never be interpolated into SQL directly.
const SORT_COLUMNS: Record<string, string> = {
  name: "name",
  createdAt: "created_at",
  updatedAt: "updated_at",
};

const DEFAULT_PAGE_SIZE = 20;

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
        created_at  TEXT NOT NULL DEFAULT '',
        updated_at  TEXT NOT NULL DEFAULT '',
        UNIQUE (name COLLATE NOCASE, environment)
      )
    `);
    this.migrateTimestampColumns();
  }

  // Idempotent: CREATE TABLE IF NOT EXISTS above doesn't alter a table that
  // already existed (pre-timestamps) installs. Add the columns once, and
  // backfill any row still carrying the '' default from an older schema.
  private migrateTimestampColumns(): void {
    const columns = this.db.prepare("PRAGMA table_info(connections)").all() as unknown as Array<{ name: string }>;
    const columnNames = new Set(columns.map((c) => c.name));

    if (!columnNames.has("created_at")) {
      this.db.exec("ALTER TABLE connections ADD COLUMN created_at TEXT NOT NULL DEFAULT ''");
    }
    if (!columnNames.has("updated_at")) {
      this.db.exec("ALTER TABLE connections ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''");
    }

    const now = new Date().toISOString();
    this.db
      .prepare("UPDATE connections SET created_at = ?, updated_at = ? WHERE created_at = ''")
      .run(now, now);
  }

  async list(query: ConnectionListQuery = {}): Promise<ConnectionListResult> {
    const sortColumn = SORT_COLUMNS[query.sortBy ?? "name"] ?? "name";
    const sortDir = query.sortDir === "desc" ? "DESC" : "ASC";
    const page = query.page && query.page > 0 ? Math.floor(query.page) : 1;
    const pageSize = query.pageSize && query.pageSize > 0 ? Math.floor(query.pageSize) : DEFAULT_PAGE_SIZE;

    // Always filter via a LIKE param — an empty search becomes '%%', which
    // matches every row, so the WHERE clause never needs to be conditional.
    const searchPattern = `%${query.search?.trim() ?? ""}%`;
    const whereClause =
      "WHERE name LIKE @search COLLATE NOCASE OR host LIKE @search COLLATE NOCASE OR database LIKE @search COLLATE NOCASE";

    const total = (
      this.db
        .prepare(`SELECT COUNT(*) AS count FROM connections ${whereClause}`)
        .get({ search: searchPattern }) as unknown as { count: number }
    ).count;

    const rows = this.db
      .prepare(
        `SELECT * FROM connections ${whereClause} ORDER BY ${sortColumn} ${sortDir}, name, environment LIMIT @limit OFFSET @offset`,
      )
      .all({ search: searchPattern, limit: pageSize, offset: (page - 1) * pageSize }) as unknown as ConnectionRow[];

    return { items: rows.map(rowToConnection), total, page, pageSize };
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
        `INSERT INTO connections (id, name, engine, host, port, database, environment, read_only, options, created_at, updated_at)
         VALUES (@id, @name, @engine, @host, @port, @database, @environment, @readOnly, @options, @createdAt, @updatedAt)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           engine = excluded.engine,
           host = excluded.host,
           port = excluded.port,
           database = excluded.database,
           environment = excluded.environment,
           read_only = excluded.read_only,
           options = excluded.options,
           created_at = excluded.created_at,
           updated_at = excluded.updated_at`,
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
        createdAt: connection.createdAt,
        updatedAt: connection.updatedAt,
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
