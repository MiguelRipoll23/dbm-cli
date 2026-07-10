import type { VALID_ENGINES, VALID_ENVIRONMENTS } from "@/constants/connection";

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
};

// Every field can be edited except id.
export type ConnectionUpdate = Partial<Omit<Connection, "id">>;

export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
  };
};
