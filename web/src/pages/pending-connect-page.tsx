import { useCallback, useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { PasswordInput } from "@/components/app/password-input";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { credentialKey } from "@/lib/crypto";
import { useVault } from "@/context/vault-context";
import { credentialOnlyFormSchema, type CredentialOnlyFormValues } from "@/schemas/connection";
import { CheckCircle2Icon, PlugZapIcon, AlertCircleIcon } from "lucide-react";
import type { PendingUnlock } from "@/types/credentials";

type Props = {
  requestId: string;
  /** Pending request info, when already known from a prior /api/pending-unlock poll. */
  pending: PendingUnlock;
};

/**
 * Shown after unlocking when the URL is /unlock/:requestId (or a pending
 * connect request is otherwise detected). Resolves the CLI's waiting
 * "connect" call with the one credential it needs, without ever exposing
 * the rest of the vault to it.
 */
export function PendingConnectPage({ requestId, pending }: Props) {
  const { vault, persistCredentials } = useVault();
  const [resolved, setResolved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const key = pending ? credentialKey(pending.connectionId) : null;
  const existingCredential = key && vault ? vault.credentials[key] : undefined;

  const form = useForm<CredentialOnlyFormValues>({
    resolver: zodResolver(credentialOnlyFormSchema),
    defaultValues: { username: "", password: "" },
  });

  const resolveWith = useCallback(
    async (username: string, password: string) => {
      setSubmitting(true);
      setError(null);
      try {
        await api.resolveUnlockRequest(requestId, username, password);
        setResolved(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to deliver credential to the CLI.");
      } finally {
        setSubmitting(false);
      }
    },
    [requestId],
  );

  // If the credential already exists in the vault, resolve immediately.
  useEffect(() => {
    if (existingCredential && !resolved && !submitting) {
      void resolveWith(existingCredential.username, existingCredential.password);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingCredential]);

  async function onCreateAndResolve(values: CredentialOnlyFormValues) {
    if (!vault || !key) return;
    setSubmitting(true);
    setError(null);
    try {
      const nextCredentials = { ...vault.credentials, [key]: values };
      await persistCredentials(nextCredentials);
      await api.resolveUnlockRequest(requestId, values.username, values.password);
      setResolved(true);
      toast.success("Credential saved and delivered");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save credential.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!pending) {
    return (
      <CenteredCard title="No pending request" description="There is no connect request waiting right now. You can close this tab.">
        <Alert>
          <AlertCircleIcon />
          <AlertDescription>
            The CLI request may have already been resolved, expired, or was addressed elsewhere.
          </AlertDescription>
        </Alert>
      </CenteredCard>
    );
  }

  if (resolved) {
    return (
      <CenteredCard
        title="Connected"
        description={`Credential for "${pending.name}" (${pending.environment}) delivered.`}
      >
        <Alert>
          <CheckCircle2Icon />
          <AlertTitle>You can return to the terminal now</AlertTitle>
          <AlertDescription>This tab can be closed.</AlertDescription>
        </Alert>
      </CenteredCard>
    );
  }

  if (existingCredential) {
    return (
      <CenteredCard title="Connecting..." description={`Delivering stored credential for "${pending.name}" (${pending.environment}).`} />
    );
  }

  return (
    <CenteredCard
      title="Credential needed"
      description={`The CLI is waiting to connect to "${pending.name}" (${pending.environment}), but no stored credential was found. Create one now.`}
    >
      <form onSubmit={form.handleSubmit(onCreateAndResolve)} className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="username">Username</Label>
          <Input id="username" {...form.register("username")} />
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
        {error && (
          <Alert variant="destructive">
            <AlertCircleIcon />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <Button type="submit" disabled={submitting}>
          <PlugZapIcon /> Save and connect
        </Button>
      </form>
    </CenteredCard>
  );
}

function CenteredCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        {children && <CardContent>{children}</CardContent>}
      </Card>
    </div>
  );
}
