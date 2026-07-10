import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/app/password-input";
import { CloseWebButton } from "@/components/app/close-web-button";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { api } from "@/lib/api";
import {
  decryptEnvelope,
  encryptEnvelope,
  DEFAULT_PBKDF2_ITERATIONS,
  InvalidMasterPasswordError,
} from "@/lib/crypto";
import { useVault } from "@/context/vault-context";
import {
  createMasterPasswordFormSchema,
  unlockFormSchema,
  type CreateMasterPasswordFormValues,
  type UnlockFormValues,
} from "@/schemas/unlock";
import type { CredentialsEnvelope } from "@/types/credentials";
import { AlertCircleIcon, LockIcon, ShieldCheckIcon } from "lucide-react";

type LoadState =
  | { status: "loading" }
  | { status: "create" }
  | { status: "unlock"; envelope: CredentialsEnvelope }
  | { status: "error"; message: string };

/**
 * Unlock screen: on mount, checks whether credentials.enc exists yet.
 *  - 404 -> first run: let the user set a master password, encrypt an empty
 *    map, and PUT the new envelope.
 *  - 200 -> ask for the existing master password and attempt to decrypt.
 * The derived key (and the decrypted map) are handed to VaultProvider,
 * in-memory only — never written to any browser storage.
 */
export function UnlockPage({ onUnlocked }: { onUnlocked: () => void }) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const { unlock } = useVault();

  useEffect(() => {
    let cancelled = false;
    api
      .getCredentialsEnvelope()
      .then((envelope) => {
        if (cancelled) return;
        setState(envelope ? { status: "unlock", envelope } : { status: "create" });
      })
      .catch((error) => {
        if (cancelled) return;
        setState({
          status: "error",
          message: error instanceof Error ? error.message : "Failed to reach the local server.",
        });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === "loading") {
    return <CenteredCard title="Loading" description="Checking for existing credentials..." />;
  }

  if (state.status === "error") {
    return (
      <CenteredCard title="Connection error" description="Could not reach the db-cli local server.">
        <Alert variant="destructive">
          <AlertCircleIcon />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      </CenteredCard>
    );
  }

  if (state.status === "create") {
    return <CreateMasterPasswordForm onUnlocked={onUnlocked} unlock={unlock} />;
  }

  return <UnlockForm envelope={state.envelope} onUnlocked={onUnlocked} unlock={unlock} />;
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
    <div className="flex min-h-svh flex-col p-4">
      <header className="flex items-center justify-end gap-2">
        <ThemeToggle />
        <CloseWebButton />
      </header>
      <div className="flex flex-1 items-center justify-center">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LockIcon className="size-5" /> {title}
            </CardTitle>
            <CardDescription className="mt-2">{description}</CardDescription>
          </CardHeader>
          {children && <CardContent>{children}</CardContent>}
        </Card>
      </div>
    </div>
  );
}

function CreateMasterPasswordForm({
  onUnlocked,
  unlock,
}: {
  onUnlocked: () => void;
  unlock: ReturnType<typeof useVault>["unlock"];
}) {
  const [submitting, setSubmitting] = useState(false);
  const form = useForm<CreateMasterPasswordFormValues>({
    resolver: zodResolver(createMasterPasswordFormSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  async function onSubmit(values: CreateMasterPasswordFormValues) {
    setSubmitting(true);
    try {
      const envelope = await encryptEnvelope(values.password, {}, DEFAULT_PBKDF2_ITERATIONS);
      await api.putCredentialsEnvelope(envelope);
      const { key } = await decryptEnvelope(envelope, values.password);
      const saltBytes = Uint8Array.from(atob(envelope.kdf.salt), (c) => c.charCodeAt(0));
      unlock({ key, salt: saltBytes, iterations: envelope.kdf.iterations, credentials: {} });
      toast.success("Master password set");
      onUnlocked();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create master password");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <CenteredCard
      title="Create a master password"
      description="No credentials vault exists yet. Choose a master password to protect it — this never leaves your browser."
    >
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="password">Master password</Label>
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
        <div className="grid gap-2">
          <Label htmlFor="confirmPassword">Confirm password</Label>
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
        <Button type="submit" disabled={submitting}>
          <ShieldCheckIcon /> Create vault
        </Button>
      </form>
    </CenteredCard>
  );
}

function UnlockForm({
  envelope,
  onUnlocked,
  unlock,
}: {
  envelope: CredentialsEnvelope;
  onUnlocked: () => void;
  unlock: ReturnType<typeof useVault>["unlock"];
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<UnlockFormValues>({
    resolver: zodResolver(unlockFormSchema),
    defaultValues: { password: "" },
  });

  async function onSubmit(values: UnlockFormValues) {
    setSubmitting(true);
    setError(null);
    try {
      const { key, salt, plaintext } = await decryptEnvelope(envelope, values.password);
      unlock({ key, salt, iterations: envelope.kdf.iterations, credentials: plaintext });
      onUnlocked();
    } catch (err) {
      if (err instanceof InvalidMasterPasswordError) {
        setError("Incorrect master password. Please try again.");
      } else {
        setError(err instanceof Error ? err.message : "Failed to unlock.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <CenteredCard title="Unlock" description="Enter your master password to unlock the credentials vault.">
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="password">Master password</Label>
          <PasswordInput
            id="password"
            autoComplete="current-password"
            value={form.watch("password")}
            onChange={(v) => form.setValue("password", v, { shouldValidate: true })}
          />
        </div>
        {error && (
          <Alert variant="destructive">
            <AlertCircleIcon />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <Button type="submit" disabled={submitting}>
          <LockIcon /> Unlock
        </Button>
      </form>
    </CenteredCard>
  );
}
