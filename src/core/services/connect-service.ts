import type { ConnectionRepository } from "../ports/connection-repository.js";
import type { SecretResolver } from "../ports/secret-resolver.js";
import type { ClientLauncher } from "../ports/client-launcher.js";
import type { ConnectionWithCredentials } from "../domain/connection.js";

export class ConnectService {
  constructor(
    private readonly repository: ConnectionRepository,
    private readonly secretResolver: SecretResolver,
    private readonly launcher: ClientLauncher,
  ) {}

  async connect(name: string, environment: string, executeCommand?: string): Promise<void> {
    const connection = await this.repository.getByName(name, environment);
    if (connection === undefined) {
      throw new Error(`Connection "${name}" for environment "${environment}" not found`);
    }
    const { username, password } = await this.secretResolver.resolveCredentials(connection);
    const connectionWithCredentials: ConnectionWithCredentials = { ...connection, username };
    await this.launcher.launch(connectionWithCredentials, password, executeCommand);
  }

  async findEnvironments(name: string): Promise<string[]> {
    const all = await this.repository.list();
    return all.filter((c) => c.name === name).map((c) => c.environment);
  }
}
