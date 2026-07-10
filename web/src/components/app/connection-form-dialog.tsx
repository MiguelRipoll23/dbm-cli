import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { KeyIcon } from "lucide-react";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PasswordInput } from "@/components/app/password-input";
import { CredentialsDialog } from "@/components/app/credentials-dialog";
import { OptionsEditor, type OptionEntry } from "@/components/app/options-editor";
import { VALID_ENGINES, VALID_ENVIRONMENTS } from "@/constants/connection";
import {
  createConnectionFormSchema,
  editConnectionFormSchema,
  type CreateConnectionFormValues,
  type EditConnectionFormValues,
} from "@/schemas/connection";
import { api } from "@/lib/api";
import { credentialKey } from "@/lib/crypto";
import { useVault } from "@/context/vault-context";
import type { Connection } from "@/types/connection";

type CreateProps = {
  mode: "create";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
};

type EditProps = {
  mode: "edit";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  connection: Connection;
};

type Props = CreateProps | EditProps;

function optionsToRecord(options: OptionEntry[]): Record<string, string> | undefined {
  const filtered = options.filter((o) => o.key.trim().length > 0);
  if (filtered.length === 0) return undefined;
  return Object.fromEntries(filtered.map((o) => [o.key, o.value]));
}

function recordToOptions(record: Record<string, string> | undefined): OptionEntry[] {
  if (!record) return [];
  return Object.entries(record).map(([key, value]) => ({ key, value }));
}

export function ConnectionFormDialog(props: Props) {
  if (props.mode === "create") {
    return <CreateConnectionDialog {...props} />;
  }
  return <EditConnectionDialog {...props} />;
}

function CreateConnectionDialog({ open, onOpenChange, onSaved }: CreateProps) {
  const { vault, persistCredentials } = useVault();
  const [submitting, setSubmitting] = useState(false);
  const [options, setOptions] = useState<OptionEntry[]>([]);

  const form = useForm<CreateConnectionFormValues>({
    resolver: zodResolver(createConnectionFormSchema),
    defaultValues: {
      name: "",
      engine: "postgres",
      host: "",
      port: 5432,
      database: "",
      environment: "development",
      readOnly: false,
      username: "",
      password: "",
    },
  });

  useEffect(() => {
    if (open) {
      form.reset();
      setOptions([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function onSubmit(values: CreateConnectionFormValues) {
    if (!vault) return;
    setSubmitting(true);
    try {
      const created = await api.createConnection({
        name: values.name,
        engine: values.engine,
        host: values.host,
        port: values.port,
        database: values.database,
        environment: values.environment,
        readOnly: values.readOnly,
        options: optionsToRecord(options),
      });
      if (!created) throw new Error("Failed to create connection");

      await persistCredentials({
        ...vault.credentials,
        [credentialKey(created.id)]: { username: values.username, password: values.password },
      });

      toast.success(`Connection "${values.name}" created`);
      onOpenChange(false);
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create connection");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New connection</DialogTitle>
          <DialogDescription>
            Register connection metadata and its credential. Both are saved together.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" {...form.register("name")} />
              {form.formState.errors.name && (
                <p className="text-destructive text-sm">{form.formState.errors.name.message}</p>
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="environment">Environment</Label>
              <Select
                value={form.watch("environment")}
                onValueChange={(v) => form.setValue("environment", v as CreateConnectionFormValues["environment"])}
              >
                <SelectTrigger id="environment" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VALID_ENVIRONMENTS.map((env) => (
                    <SelectItem key={env} value={env}>
                      {env}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="engine">Engine</Label>
              <Select
                value={form.watch("engine")}
                onValueChange={(v) => form.setValue("engine", v as CreateConnectionFormValues["engine"])}
              >
                <SelectTrigger id="engine" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VALID_ENGINES.map((engine) => (
                    <SelectItem key={engine} value={engine}>
                      {engine}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="port">Port</Label>
              <Input id="port" type="number" {...form.register("port", { valueAsNumber: true })} />
              {form.formState.errors.port && (
                <p className="text-destructive text-sm">{form.formState.errors.port.message}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="host">Host</Label>
              <Input id="host" {...form.register("host")} />
              {form.formState.errors.host && (
                <p className="text-destructive text-sm">{form.formState.errors.host.message}</p>
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="database">Database</Label>
              <Input id="database" {...form.register("database")} />
              {form.formState.errors.database && (
                <p className="text-destructive text-sm">{form.formState.errors.database.message}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="readOnly"
              checked={form.watch("readOnly")}
              onCheckedChange={(checked) => form.setValue("readOnly", checked === true)}
            />
            <Label htmlFor="readOnly">Read only</Label>
          </div>

          <OptionsEditor value={options} onChange={setOptions} />

          <div className="grid grid-cols-2 gap-4">
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
          </div>

          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditConnectionDialog({ open, onOpenChange, onSaved, connection }: EditProps) {
  const [submitting, setSubmitting] = useState(false);
  const [options, setOptions] = useState<OptionEntry[]>(recordToOptions(connection.options));
  const [credentialsOpen, setCredentialsOpen] = useState(false);

  const form = useForm<EditConnectionFormValues>({
    resolver: zodResolver(editConnectionFormSchema),
    defaultValues: {
      name: connection.name,
      engine: connection.engine,
      environment: connection.environment,
      host: connection.host,
      port: connection.port,
      database: connection.database,
      readOnly: connection.readOnly ?? false,
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        name: connection.name,
        engine: connection.engine,
        environment: connection.environment,
        host: connection.host,
        port: connection.port,
        database: connection.database,
        readOnly: connection.readOnly ?? false,
      });
      setOptions(recordToOptions(connection.options));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, connection]);

  async function onSubmit(values: EditConnectionFormValues) {
    setSubmitting(true);
    try {
      await api.updateConnection(connection.id, {
        name: values.name,
        engine: values.engine,
        environment: values.environment,
        host: values.host,
        port: values.port,
        database: values.database,
        readOnly: values.readOnly,
        options: optionsToRecord(options),
      });

      toast.success(`Connection "${values.name}" updated`);
      onOpenChange(false);
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update connection");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Edit {connection.name} ({connection.environment})
          </DialogTitle>
          <DialogDescription>Update any field below. Use "Change credentials" to update the stored username/password.</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" {...form.register("name")} />
              {form.formState.errors.name && (
                <p className="text-destructive text-sm">{form.formState.errors.name.message}</p>
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="environment">Environment</Label>
              <Select
                value={form.watch("environment")}
                onValueChange={(v) => form.setValue("environment", v as EditConnectionFormValues["environment"])}
              >
                <SelectTrigger id="environment" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VALID_ENVIRONMENTS.map((env) => (
                    <SelectItem key={env} value={env}>
                      {env}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="engine">Engine</Label>
              <Select
                value={form.watch("engine")}
                onValueChange={(v) => form.setValue("engine", v as EditConnectionFormValues["engine"])}
              >
                <SelectTrigger id="engine" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VALID_ENGINES.map((engine) => (
                    <SelectItem key={engine} value={engine}>
                      {engine}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="port">Port</Label>
              <Input id="port" type="number" {...form.register("port", { valueAsNumber: true })} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="host">Host</Label>
              <Input id="host" {...form.register("host")} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="database">Database</Label>
              <Input id="database" {...form.register("database")} />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="readOnly"
              checked={form.watch("readOnly")}
              onCheckedChange={(checked) => form.setValue("readOnly", checked === true)}
            />
            <Label htmlFor="readOnly">Read only</Label>
          </div>

          <OptionsEditor value={options} onChange={setOptions} />

          <Button type="button" variant="outline" onClick={() => setCredentialsOpen(true)}>
            <KeyIcon /> Change credentials
          </Button>

          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              Save changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>

      <CredentialsDialog open={credentialsOpen} onOpenChange={setCredentialsOpen} connection={connection} />
    </Dialog>
  );
}
