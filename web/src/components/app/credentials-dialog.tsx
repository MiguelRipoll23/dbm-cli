import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/app/password-input";
import { credentialOnlyFormSchema, type CredentialOnlyFormValues } from "@/schemas/connection";
import { credentialKey } from "@/lib/crypto";
import { useVault } from "@/context/vault-context";
import type { Connection } from "@/types/connection";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connection: Connection;
};

/**
 * Dedicated "change credentials" dialog, opened from the edit-connection
 * form. Kept separate from connection metadata editing so the form isn't
 * cluttered with "(optional) leave blank to keep existing" fields — this
 * dialog only ever sets a new credential, replacing the stored one.
 */
export function CredentialsDialog({ open, onOpenChange, connection }: Props) {
  const { vault, persistCredentials } = useVault();
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<CredentialOnlyFormValues>({
    resolver: zodResolver(credentialOnlyFormSchema),
    defaultValues: { username: "", password: "" },
  });

  useEffect(() => {
    if (open) {
      form.reset({ username: "", password: "" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function onSubmit(values: CredentialOnlyFormValues) {
    if (!vault) return;
    setSubmitting(true);
    try {
      await persistCredentials({
        ...vault.credentials,
        [credentialKey(connection.id)]: values,
      });
      toast.success(`Credentials for "${connection.name}" updated`);
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update credentials");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change credentials</DialogTitle>
          <DialogDescription>
            Set the username and password used to connect to "{connection.name}" ({connection.environment}). This replaces the stored credential.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="username">Username</Label>
            <Input id="username" autoComplete="username" {...form.register("username")} />
            {form.formState.errors.username && (
              <p className="text-destructive text-sm">{form.formState.errors.username.message}</p>
            )}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="password">Password</Label>
            <PasswordInput
              id="password"
              autoComplete="new-password"
              value={form.watch("password")}
              onChange={(v) => form.setValue("password", v, { shouldValidate: true })}
            />
            {form.formState.errors.password && (
              <p className="text-destructive text-sm">{form.formState.errors.password.message}</p>
            )}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              Save credentials
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
