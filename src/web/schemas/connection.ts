import { z } from "zod";
import { SORTABLE_CONNECTION_FIELDS, VALID_ENGINES, VALID_ENVIRONMENTS } from "../../core/domain/connection.js";

// ponytail: mirrors core/domain/connection.ts connectionSchema — kept
// separate since it's used purely for wire validation in this transport
// layer. Reducible if the duplication ever becomes a maintenance burden.
export const connectionSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1, "name is required"),
  engine: z.enum(VALID_ENGINES),
  host: z.string(),
  port: z.number().int().positive(),
  database: z.string(),
  environment: z.enum(VALID_ENVIRONMENTS),
  readOnly: z.boolean().optional(),
  options: z.record(z.string(), z.string()).optional(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

// A new connection has no id or timestamps yet — the server generates them.
export const newConnectionSchema = connectionSchema.omit({ id: true, createdAt: true, updatedAt: true });

// Every field except id/timestamps can be edited, including name/engine/environment.
export const connectionUpdateSchema = connectionSchema.omit({ id: true, createdAt: true, updatedAt: true }).partial();

export const connectionIdParam = z.object({
  id: z.uuid(),
});

// GET /api/connections query params — everything arrives as a string, so
// page/pageSize are coerced; sortBy/sortDir/search are optional.
export const connectionListQuerySchema = z.object({
  search: z.string().optional(),
  sortBy: z.enum(SORTABLE_CONNECTION_FIELDS).optional(),
  sortDir: z.enum(["asc", "desc"]).optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
});

export const errorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});
