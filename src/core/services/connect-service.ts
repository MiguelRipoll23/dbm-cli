import type { ConnectionRepository } from "../ports/connection-repository.js";
import type { SecretResolver } from "../ports/secret-resolver.js";
import type { ClientLauncher } from "../ports/client-launcher.js";

export class ConnectService {
  constructor(
    private readonly repository: ConnectionRepository,
    private readonly secretResolver: SecretResolver,
    private readonly launcher: ClientLauncher,
  ) {}

  async connect(name: string): Promise<void> {
    const connection = await this.repository.get(name);
    if (connection === undefined) {
      throw new Error(`Connection "${name}" not found`);
    }
    const password = await this.secretResolver.resolvePassword(connection.keepass);
    await this.launcher.launch(connection, password);
  }
}
