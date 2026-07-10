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
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/app/password-input";
import {
  changeMasterPasswordFormSchema,
  type ChangeMasterPasswordFormValues,
} from "@/schemas/unlock";
import { InvalidMasterPasswordError } from "@/lib/crypto";
import { useVault } from "@/context/vault-context";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** Settings dialog: currently just "change master password", re-encrypting the whole vault under a new password. */
export function SettingsDialog({ open, onOpenChange }: Props) {
  const { changeMasterPassword } = useVault();
  const [submitting, setSubmitting] = useState(false);
  const form = useForm<ChangeMasterPasswordFormValues>({
    resolver: zodResolver(changeMasterPasswordFormSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });

  useEffect(() => {
    if (open) {
      form.reset({ currentPassword: "", newPassword: "", confirmPassword: "" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function onSubmit(values: ChangeMasterPasswordFormValues) {
    setSubmitting(true);
    try {
      await changeMasterPassword(values.currentPassword, values.newPassword);
      toast.success("Master password updated");
      onOpenChange(false);
    } catch (error) {
      if (error instanceof InvalidMasterPasswordError) {
        form.setError("currentPassword", { message: "Incorrect current password" });
      } else {
        toast.error(error instanceof Error ? error.message : "Failed to update master password");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Change the master password used to encrypt your credentials vault.</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="currentPassword">Current master password</Label>
            <PasswordInput
              id="currentPassword"
              autoComplete="current-password"
              value={form.watch("currentPassword")}
              onChange={(v) => form.setValue("currentPassword", v, { shouldValidate: true })}
            />
            {form.formState.errors.currentPassword && (
              <p className="text-destructive text-sm">{form.formState.errors.currentPassword.message}</p>
            )}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="newPassword">New master password</Label>
            <PasswordInput
              id="newPassword"
              autoComplete="new-password"
              value={form.watch("newPassword")}
              onChange={(v) => form.setValue("newPassword", v, { shouldValidate: true })}
            />
            {form.formState.errors.newPassword && (
              <p className="text-destructive text-sm">{form.formState.errors.newPassword.message}</p>
            )}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="confirmPassword">Confirm new password</Label>
            <PasswordInput
              id="confirmPassword"
              autoComplete="new-password"
              value={form.watch("confirmPassword")}
              onChange={(v) => form.setValue("confirmPassword", v, { shouldValidate: true })}
            />
            {form.formState.errors.confirmPassword && (
              <p className="text-destructive text-sm">{form.formState.errors.confirmPassword.message}</p>
            )}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              Update password
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
