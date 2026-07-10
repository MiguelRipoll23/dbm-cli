import { z } from "zod";

const MIN_PASSWORD_LENGTH = 8;

export const createMasterPasswordFormSchema = z
  .object({
    password: z.string().min(MIN_PASSWORD_LENGTH, `Must be at least ${MIN_PASSWORD_LENGTH} characters`),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type CreateMasterPasswordFormValues = z.infer<typeof createMasterPasswordFormSchema>;

export const unlockFormSchema = z.object({
  password: z.string().min(1, "Required"),
});

export type UnlockFormValues = z.infer<typeof unlockFormSchema>;

export const changeMasterPasswordFormSchema = z
  .object({
    currentPassword: z.string().min(1, "Required"),
    newPassword: z.string().min(MIN_PASSWORD_LENGTH, `Must be at least ${MIN_PASSWORD_LENGTH} characters`),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type ChangeMasterPasswordFormValues = z.infer<typeof changeMasterPasswordFormSchema>;
