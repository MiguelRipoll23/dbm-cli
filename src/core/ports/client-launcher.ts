import type { Connection } from "../domain/connection.js";

export interface ClientLauncher {
  launch(connection: Connection, password: string): Promise<void>;
}
