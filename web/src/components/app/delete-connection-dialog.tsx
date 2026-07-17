import { useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { api } from "@/lib/api";
import { credentialKey } from "@/lib/crypto";
import { useVault } from "@/context/vault-context";
import type { Connection } from "@/types/connection";

type Props = {
  connection: Connection | null;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
};

export function DeleteConnectionDialog({ connection, onOpenChange, onDeleted }: Props) {
  const { vault, persistCredentials } = useVault();
  const [submitting, setSubmitting] = useState(false);

  async function handleConfirm() {
    if (!connection) return;
    setSubmitting(true);
    try {
      await api.deleteConnection(connection.id);

      if (vault) {
        const key = credentialKey(connection.id);
        if (key in vault.credentials) {
          const nextCredentials = { ...vault.credentials };
          delete nextCredentials[key];
          await persistCredentials(nextCredentials);
        }
      }

      toast.success(`Connection "${connection.name}" deleted`);
      onOpenChange(false);
      onDeleted();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete connection");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AlertDialog open={connection !== null} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete connection?</AlertDialogTitle>
          <AlertDialogDescription>
            {connection &&
              `This will permanently remove "${connection.name}" (${connection.environment}) and its stored credential, if any.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
          <AlertDialogAction disabled={submitting} onClick={handleConfirm}>
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
