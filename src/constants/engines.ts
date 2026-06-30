import type { ConnectionWithCredentials, Engine } from "../core/domain/connection.js";

export type EngineConfig = {
  clientBinary: string;
  downloadHint: string;
  buildArgs: (connection: ConnectionWithCredentials) => string[];
  buildEnv: (password: string) => Record<string, string>;
  buildStdin?: (connection: ConnectionWithCredentials, password: string) => string;
  buildExecuteArgs?: (command: string) => string[];
  buildExecuteStdin?: (connection: ConnectionWithCredentials, password: string, command: string) => string;
  buildReadOnlyArgs?: () => string[];
  buildReadOnlyEnv?: () => Record<string, string>;
};

export const ENGINE_CONFIGS: Record<Engine, EngineConfig> = {
  mssql: {
    clientBinary: "sqlcmd",
    downloadHint:
      "Download sqlcmd from https://learn.microsoft.com/en-us/sql/tools/sqlcmd/sqlcmd-utility",
    buildArgs: (connection) => [
      "-S",
      `${connection.host},${connection.port}`,
      "-U",
      connection.username,
      "-d",
      connection.database,
    ],
    buildEnv: (password) => ({ SQLCMDPASSWORD: password }),
    buildExecuteArgs: (command) => ["-Q", command],
  },

  oracle: {
    clientBinary: "sqlplus",
    downloadHint:
      "Download sqlplus from https://www.oracle.com/database/technologies/instant-client/downloads.html",
    buildArgs: () => ["/nolog"],
    buildEnv: () => ({}),
    buildStdin: (connection, password) =>
      `CONNECT ${connection.username}/${password}@${connection.host}:${connection.port}/${connection.database}\n`,
    buildExecuteStdin: (connection, password, command) =>
      `CONNECT ${connection.username}/${password}@${connection.host}:${connection.port}/${connection.database}\n${command}\nEXIT\n`,
  },

  mariadb: {
    clientBinary: "mariadb",
    downloadHint:
      "Download mariadb client from https://mariadb.org/download/",
    buildArgs: (connection) => [
      "-h",
      connection.host,
      "-P",
      String(connection.port),
      "-u",
      connection.username,
      connection.database,
      ...Object.entries(connection.options ?? {}).map(([key, value]) =>
        value === "" ? `--${key}` : `--${key}=${value}`,
      ),
    ],
    buildEnv: (password) => ({ MYSQL_PWD: password }),
    buildExecuteArgs: (command) => ["-e", command],
    buildReadOnlyArgs: () => ["--init-command=SET SESSION transaction_read_only=1"],
  },

  postgres: {
    clientBinary: "psql",
    downloadHint:
      "Download psql from https://www.postgresql.org/download/",
    buildArgs: (connection) => [
      "-h",
      connection.host,
      "-p",
      String(connection.port),
      "-U",
      connection.username,
      "-d",
      connection.database,
      ...Object.entries(connection.options ?? {}).map(([key, value]) =>
        value === "" ? `--${key}` : `--${key}=${value}`,
      ),
    ],
    buildEnv: (password) => ({ PGPASSWORD: password }),
    buildExecuteArgs: (command) => ["-c", command],
    buildReadOnlyEnv: () => ({ PGOPTIONS: "-c default_transaction_read_only=on" }),
  },
};
