import type { Connection, Engine } from "../core/domain/connection.js";

export type EngineConfig = {
  clientBinary: string;
  buildArgs: (connection: Connection) => string[];
  buildEnv: (password: string) => Record<string, string>;
  buildStdin?: (connection: Connection, password: string) => string;
};

export const ENGINE_CONFIGS: Record<Engine, EngineConfig> = {
  mssql: {
    clientBinary: "sqlcmd",
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
    buildArgs: () => ["/nolog"],
    buildEnv: () => ({}),
    buildStdin: (connection, password) =>
      `CONNECT ${connection.username}/${password}@${connection.host}:${connection.port}/${connection.database}\n`,
  },

  mariadb: {
    clientBinary: "mariadb",
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
