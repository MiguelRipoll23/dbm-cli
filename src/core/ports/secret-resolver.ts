import type { KeepassReference } from "../domain/connection.js";

export interface SecretResolver {
  resolvePassword(reference: KeepassReference): Promise<string>;
}
