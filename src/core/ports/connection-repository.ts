import type { Connection } from "../domain/connection.js";

export interface ConnectionRepository {
  list(): Promise<Connection[]>;
  get(name: string): Promise<Connection | undefined>;
  save(connection: Connection): Promise<void>;
  remove(name: string): Promise<void>;
}
