import type { Connection } from "../domain/connection.js";

export type Credentials = {
  username: string;
  password: string;
};

export interface SecretResolver {
  resolveCredentials(connection: Connection): Promise<Credentials>;
}
