import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { PlusIcon, PencilIcon, Trash2Icon, SettingsIcon, ChevronUpIcon, ChevronDownIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import type { Connection, ConnectionSortField, SortDirection } from "@/types/connection";

const PAGE_SIZE = 20;

const SORT_COLUMNS: Array<{ field: ConnectionSortField; label: string }> = [
  { field: "name", label: "Name" },
  { field: "createdAt", label: "Created" },
  { field: "updatedAt", label: "Modified" },
];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

export function DashboardPage() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<ConnectionSortField>("name");
  const [sortDir, setSortDir] = useState<SortDirection>("asc");
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Connection | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Connection | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const loadConnections = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.listConnections({ search: search || undefined, sortBy, sortDir, page, pageSize: PAGE_SIZE });
      setConnections(result.items);
      setTotal(result.total);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load connections");
    } finally {
      setLoading(false);
    }
  }, [search, sortBy, sortDir, page]);

  useEffect(() => {
    void loadConnections();
  }, [loadConnections]);

  // Debounce search input; reset to page 1 whenever the query changes.
  const [searchInput, setSearchInput] = useState("");
  useEffect(() => {
    const timeout = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(timeout);
  }, [searchInput]);

  function toggleSort(field: ConnectionSortField) {
    if (field === sortBy) {
      setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortDir("asc");
    }
    setPage(1);
  }

  const pageStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const pageEnd = Math.min(page * PAGE_SIZE, total);
  const hasNextPage = page * PAGE_SIZE < total;

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
          <Input
            placeholder="Search by name, host, or database…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="mt-2 max-w-sm"
            aria-label="Search connections"
          />
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                {SORT_COLUMNS.map(({ field, label }) => (
                  <TableHead key={field}>
                    <button
                      type="button"
                      className="flex items-center gap-1 font-medium"
                      onClick={() => toggleSort(field)}
                    >
                      {label}
                      {sortBy === field &&
                        (sortDir === "asc" ? (
                          <ChevronUpIcon className="size-3" />
                        ) : (
                          <ChevronDownIcon className="size-3" />
                        ))}
                    </button>
                  </TableHead>
                ))}
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
                  <TableCell colSpan={10} className="text-muted-foreground text-center">
                    No connections found.
                  </TableCell>
                </TableRow>
              )}
              {connections.map((connection) => (
                <TableRow key={connection.id}>
                  <TableCell className="font-medium">{connection.name}</TableCell>
                  <TableCell>{formatDate(connection.createdAt)}</TableCell>
                  <TableCell>{formatDate(connection.updatedAt)}</TableCell>
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

          <div className="text-muted-foreground mt-4 flex items-center justify-between text-sm">
            <span>
              {total === 0 ? "No results" : `Showing ${pageStart}–${pageEnd} of ${total}`}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </Button>
              <Button variant="outline" size="sm" disabled={!hasNextPage} onClick={() => setPage((p) => p + 1)}>
                Next
              </Button>
            </div>
          </div>
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
          onSaved={() => void loadConnections()}
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
