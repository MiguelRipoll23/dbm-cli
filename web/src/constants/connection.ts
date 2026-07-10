// Mirrors src/core/domain/connection.ts on the backend. Kept in sync by hand
// since the web/ SPA is an independent project with no shared package.
export const VALID_ENGINES = ["mssql", "oracle", "mariadb", "postgres"] as const;

export const VALID_ENVIRONMENTS = [
  "development",
  "staging",
  "production",
  "local",
] as const;
