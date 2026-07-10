import type { ConnectionWithCredentials } from "../domain/connection.js";

export interface ClientLauncher {
  launch(connection: ConnectionWithCredentials, password: string, executeCommand?: string): Promise<void>;
}
