import { z } from "zod";

export type Engine = "mssql" | "oracle" | "mariadb" | "postgres";

export const VALID_ENGINES: Engine[] = ["mssql", "oracle", "mariadb", "postgres"];

export type Environment = "development" | "staging" | "production" | "local";

export const VALID_ENVIRONMENTS: Environment[] = ["development", "staging", "production", "local"];

export type KeepassReference = {
  databasePath: string;
  entryPath: string;
};

export type Connection = {
  name: string;
  engine: Engine;
  host: string;
  port: number;
  database: string;
  username: string;
  keepass: KeepassReference;
  environment?: Environment;
  options?: Record<string, string>;
};

export const connectionSchema = z.object({
  name: z.string(),
  engine: z.enum(["mssql", "oracle", "mariadb", "postgres"]),
  host: z.string(),
  port: z.number().int().positive(),
  database: z.string(),
  username: z.string(),
  keepass: z.object({
    databasePath: z.string(),
    entryPath: z.string(),
  }),
  environment: z.enum(["development", "staging", "production", "local"]).optional(),
  options: z.record(z.string(), z.string()).optional(),
});

export const connectionsMapSchema = z.record(z.string(), connectionSchema);
