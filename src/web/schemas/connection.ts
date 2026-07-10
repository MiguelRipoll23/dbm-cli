import { z } from "zod";
import { HOSTNAME_LABEL_REGEX, VALID_ENGINES, VALID_ENVIRONMENTS } from "../../core/domain/connection.js";

// ponytail: mirrors core/domain/connection.ts connectionSchema — kept
// separate since it's used purely for wire validation in this transport
// layer. Reducible if the duplication ever becomes a maintenance burden.
export const connectionSchema = z.object({
  id: z.uuid(),
  name: z
    .string()
    .regex(HOSTNAME_LABEL_REGEX, "must be a valid hostname label (alphanumeric and hyphens, no leading/trailing hyphen)"),
  engine: z.enum(VALID_ENGINES),
  host: z.string(),
  port: z.number().int().positive(),
  database: z.string(),
  environment: z.enum(VALID_ENVIRONMENTS),
  readOnly: z.boolean().optional(),
  options: z.record(z.string(), z.string()).optional(),
});

// A new connection has no id yet — the server generates one.
export const newConnectionSchema = connectionSchema.omit({ id: true });

// Every field except id can be edited, including name/engine/environment.
export const connectionUpdateSchema = connectionSchema.omit({ id: true }).partial();

export const connectionIdParam = z.object({
  id: z.uuid(),
});

export const errorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});
