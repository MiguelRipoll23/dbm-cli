import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { PlusIcon, PencilIcon, Trash2Icon, SettingsIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { ConnectionFormDialog } from "@/components/app/connection-form-dialog";
import { DeleteConnectionDialog } from "@/components/app/delete-connection-dialog";
import { SettingsDialog } from "@/components/app/settings-dialog";
import { CloseWebButton } from "@/components/app/close-web-button";
import { api } from "@/lib/api";
import type { Connection } from "@/types/connection";

export function DashboardPage() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Connection | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Connection | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const loadConnections = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api.listConnections();
      setConnections(list);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load connections");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadConnections();
  }, [loadConnections]);

  const handleConnectionUpdated = useCallback((updated: Connection) => {
    setConnections((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
  }, []);

  return (
    <div className="mx-auto max-w-5xl p-6">
      <header className="mb-6 flex items-center justify-end">
        <div className="flex items-center gap-2">
          <Button onClick={() => setCreateOpen(true)}>
            <PlusIcon /> New connection
          </Button>
          <ThemeToggle />
          <Button variant="outline" size="icon" title="Settings" aria-label="Settings" onClick={() => setSettingsOpen(true)}>
            <SettingsIcon />
          </Button>
          <CloseWebButton />
        </div>
      </header>

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />

      <Card>
        <CardHeader>
          <CardTitle>Connections</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Environment</TableHead>
                <TableHead>Engine</TableHead>
                <TableHead>Host</TableHead>
                <TableHead>Port</TableHead>
                <TableHead>Database</TableHead>
                <TableHead>Read only</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {connections.length === 0 && !loading && (
                <TableRow>
                  <TableCell colSpan={8} className="text-muted-foreground text-center">
                    No connections yet.
                  </TableCell>
                </TableRow>
              )}
              {connections.map((connection) => (
                <TableRow key={connection.id}>
                  <TableCell className="font-medium">{connection.name}</TableCell>
                  <TableCell>{connection.environment}</TableCell>
                  <TableCell>{connection.engine}</TableCell>
                  <TableCell>{connection.host}</TableCell>
                  <TableCell>{connection.port}</TableCell>
                  <TableCell>{connection.database}</TableCell>
                  <TableCell>{connection.readOnly ? "Yes" : "No"}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Edit ${connection.name}`}
                      onClick={() => setEditTarget(connection)}
                    >
                      <PencilIcon className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Delete ${connection.name}`}
                      onClick={() => setDeleteTarget(connection)}
                    >
                      <Trash2Icon className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <ConnectionFormDialog
        mode="create"
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSaved={loadConnections}
      />

      {editTarget && (
        <ConnectionFormDialog
          mode="edit"
          open={editTarget !== null}
          onOpenChange={(open) => !open && setEditTarget(null)}
          onSaved={handleConnectionUpdated}
          connection={editTarget}
        />
      )}

      <DeleteConnectionDialog
        connection={deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        onDeleted={loadConnections}
      />
    </div>
  );
}
