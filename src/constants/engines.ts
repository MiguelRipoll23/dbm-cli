import type { ConnectionWithCredentials, Engine } from "../core/domain/connection.js";

export type EngineConfig = {
  clientBinary: string;
  downloadHint: string;
  buildArgs: (connection: ConnectionWithCredentials) => string[];
  buildEnv: (password: string) => Record<string, string>;
  buildStdin?: (connection: ConnectionWithCredentials, password: string) => string;
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
  },

  oracle: {
    clientBinary: "sqlplus",
    downloadHint:
      "Download sqlplus from https://www.oracle.com/database/technologies/instant-client/downloads.html",
    buildArgs: () => ["/nolog"],
    buildEnv: () => ({}),
    buildStdin: (connection, password) =>
      `CONNECT ${connection.username}/${password}@${connection.host}:${connection.port}/${connection.database}\n`,
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
    ],
    buildEnv: (password) => ({ MYSQL_PWD: password }),
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
    ],
    buildEnv: (password) => ({ PGPASSWORD: password }),
  },
};
