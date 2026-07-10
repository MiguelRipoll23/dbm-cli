import type { Connection } from "../domain/connection.js";

export interface ConnectionRepository {
  list(): Promise<Connection[]>;
  getById(id: string): Promise<Connection | undefined>;
  getByName(name: string, environment: string): Promise<Connection | undefined>;
  save(connection: Connection): Promise<void>;
  remove(id: string): Promise<void>;
}
