import { z } from "@hono/zod-openapi";
import { HOSTNAME_LABEL_REGEX, VALID_ENGINES, VALID_ENVIRONMENTS } from "../../core/domain/connection.js";

// Mirrors core/domain/connection.ts connectionSchema, but built with the
// @hono/zod-openapi `z` so routes can attach OpenAPI metadata (.openapi()).
// Kept in the web layer since the OpenAPI-specific annotations are a
// transport/documentation concern, not a domain one.
export const connectionSchema = z
  .object({
    id: z.uuid().openapi({ description: "Stable identifier, generated server-side. Never changes." }),
    name: z
      .string()
      .regex(HOSTNAME_LABEL_REGEX, "must be a valid hostname label (alphanumeric and hyphens, no leading/trailing hyphen)")
      .openapi({ example: "orders-db" }),
    engine: z.enum(VALID_ENGINES).openapi({ example: "postgres" }),
    host: z.string().openapi({ example: "db.internal.example.com" }),
    port: z.number().int().positive().openapi({ example: 5432 }),
    database: z.string().openapi({ example: "orders" }),
    environment: z.enum(VALID_ENVIRONMENTS).openapi({ example: "development" }),
    readOnly: z.boolean().optional(),
    options: z.record(z.string(), z.string()).optional(),
  })
  .openapi("Connection");

// A new connection has no id yet — the server generates one.
export const newConnectionSchema = connectionSchema.omit({ id: true }).openapi("NewConnection");

// Every field except id can be edited, including name/engine/environment.
export const connectionUpdateSchema = connectionSchema.omit({ id: true }).partial().openapi("ConnectionUpdate");

export const connectionIdParam = z.object({
  id: z.uuid().openapi({ param: { name: "id", in: "path" } }),
});

export const errorResponseSchema = z
  .object({
    error: z.object({
      code: z.string().openapi({ example: "NOT_FOUND" }),
      message: z.string().openapi({ example: "Connection \"orders-db\" in environment \"development\" not found" }),
    }),
  })
  .openapi("ErrorResponse");
