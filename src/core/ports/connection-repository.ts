import type { Connection, ConnectionListQuery, ConnectionListResult } from "../domain/connection.js";

export interface ConnectionRepository {
  list(query?: ConnectionListQuery): Promise<ConnectionListResult>;
  getById(id: string): Promise<Connection | undefined>;
  getByName(name: string, environment: string): Promise<Connection | undefined>;
  save(connection: Connection): Promise<void>;
  remove(id: string): Promise<void>;
}
