import { z } from "zod";
import { VALID_ENGINES, VALID_ENVIRONMENTS } from "@/constants/connection";

const connectionName = z.string().min(1, "Required");

const optionsField = z
  .array(z.object({ key: z.string().min(1, "Required"), value: z.string() }))
  .optional();

// Used by the "create connection" dialog: full metadata plus an optional
// credential pair (username/password) to seed the encrypted map with.
export const createConnectionFormSchema = z.object({
  name: connectionName,
  engine: z.enum(VALID_ENGINES),
  host: z.string().min(1, "Required"),
  port: z.number({ error: "Required" }).int().positive("Must be a positive integer"),
  database: z.string().min(1, "Required"),
  environment: z.enum(VALID_ENVIRONMENTS),
  readOnly: z.boolean().optional(),
  options: optionsField,
  username: z.string().min(1, "Required"),
  password: z.string().min(1, "Required"),
});

// Use the pre-coercion "input" type for useForm's generic: react-hook-form
// tracks field values before zod's coercion runs (e.g. port arrives as a
// string from an <input type="number">), while zodResolver only guarantees
// the coerced "output" type after validation succeeds.
export type CreateConnectionFormValues = z.input<typeof createConnectionFormSchema>;
export type CreateConnectionFormOutput = z.output<typeof createConnectionFormSchema>;

// Used by the "edit connection" dialog. Every field can change except the
// connection's id — including name, engine, and environment. Credentials
// are edited separately via CredentialsDialog (credentialOnlyFormSchema
// below), not as part of this form.
export const editConnectionFormSchema = z.object({
  name: connectionName,
  engine: z.enum(VALID_ENGINES),
  environment: z.enum(VALID_ENVIRONMENTS),
  host: z.string().min(1, "Required"),
  port: z.number({ error: "Required" }).int().positive("Must be a positive integer"),
  database: z.string().min(1, "Required"),
  readOnly: z.boolean().optional(),
  options: optionsField,
});

export type EditConnectionFormValues = z.input<typeof editConnectionFormSchema>;
export type EditConnectionFormOutput = z.output<typeof editConnectionFormSchema>;

export const credentialOnlyFormSchema = z.object({
  username: z.string().min(1, "Required"),
  password: z.string().min(1, "Required"),
});

export type CredentialOnlyFormValues = z.infer<typeof credentialOnlyFormSchema>;
