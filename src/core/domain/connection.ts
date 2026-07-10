import { z } from "zod";

export type Engine = "mssql" | "oracle" | "mariadb" | "postgres";

export const VALID_ENGINES: Engine[] = ["mssql", "oracle", "mariadb", "postgres"];

export type Environment = "development" | "staging" | "production" | "local";

export const VALID_ENVIRONMENTS: Environment[] = ["development", "staging", "production", "local"];

export type Connection = {
  id: string;
  name: string;
  engine: Engine;
  host: string;
  port: number;
  database: string;
  environment: Environment;
  readOnly?: boolean;
  options?: Record<string, string>;
};

export const connectionSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1, "name is required"),
  engine: z.enum(["mssql", "oracle", "mariadb", "postgres"]),
  host: z.string(),
  port: z.number().int().positive(),
  database: z.string(),
  environment: z.enum(["development", "staging", "production", "local"]),
  readOnly: z.boolean().optional(),
  options: z.record(z.string(), z.string()).optional(),
});

// Fields the client can set at creation time; the id is generated server-side.
export const newConnectionSchema = connectionSchema.omit({ id: true });

export type ConnectionWithCredentials = Connection & { username: string };
