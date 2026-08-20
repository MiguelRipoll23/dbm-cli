import type { SORTABLE_CONNECTION_FIELDS, VALID_ENGINES, VALID_ENVIRONMENTS } from "@/constants/connection";

export type Engine = (typeof VALID_ENGINES)[number];

export type Environment = (typeof VALID_ENVIRONMENTS)[number];

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

// Every field can be edited except id/timestamps.
export type ConnectionUpdate = Partial<Omit<Connection, "id" | "createdAt" | "updatedAt">>;

export type ConnectionSortField = (typeof SORTABLE_CONNECTION_FIELDS)[number];

export type SortDirection = "asc" | "desc";

export type ConnectionListParams = {
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

export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
  };
};
