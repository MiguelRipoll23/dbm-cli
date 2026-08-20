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
  createdAt: string;
  updatedAt: string;
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
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

// Fields the client can set at creation time; id and timestamps are
// generated server-side (see ConnectionService.create).
export const newConnectionSchema = connectionSchema.omit({ id: true, createdAt: true, updatedAt: true });

export type ConnectionWithCredentials = Connection & { username: string };

export const SORTABLE_CONNECTION_FIELDS = ["name", "createdAt", "updatedAt"] as const;
export type ConnectionSortField = (typeof SORTABLE_CONNECTION_FIELDS)[number];

export type SortDirection = "asc" | "desc";

export type ConnectionListQuery = {
  search?: string;
  sortBy?: ConnectionSortField;
  sortDir?: SortDirection;
  page?: number;
  pageSize?: number;
};

export type ConnectionListResult = {
  items: Connection[];
  total: number;
  page: number;
  pageSize: number;
};

// Sentinel pageSize for callers (CLI) that want every row, bypassing pagination.
export const UNPAGINATED = Number.MAX_SAFE_INTEGER;
