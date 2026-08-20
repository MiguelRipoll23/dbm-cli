import { useState } from "react";
import { PowerIcon } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { api } from "@/lib/api";

/**
 * Closes the web UI via POST /api/shutdown, so the user doesn't need to go
 * back to the terminal and press Ctrl+C. In a foreground `dbm web` session
 * this stops the local server (closing almost immediately — any response,
 * including a network failure since the socket may already be gone, is
 * treated as success). When the UI is served by the background daemon the
 * request is a deliberate no-op (the daemon must survive a stray tab); the
 * button then only closes the tab.
 */
export function CloseWebButton() {
  const [open, setOpen] = useState(false);
  const [closed, setClosed] = useState(false);

  async function handleConfirm() {
    try {
      await api.shutdown();
    } catch {
      // The server may close the connection before the response finishes —
      // that's still a successful shutdown from the user's point of view.
    }
    // Auto-close the tab. Browsers only allow window.close() on tabs opened
    // by script (which is how the CLI opens this one); otherwise it's a
    // silent no-op and the fallback screen below covers that case.
    window.close();
    setClosed(true);
  }

  if (closed) {
    return (
      <div className="bg-background fixed inset-0 z-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Web UI closed</CardTitle>
            <CardDescription>The local server has stopped. You can close this tab.</CardDescription>
          </CardHeader>
          <CardContent />
        </Card>
      </div>
    );
  }

  return (
    <>
      <Button
        variant="outline"
        size="icon"
        title="Close web UI"
        aria-label="Close web UI"
        onClick={() => setOpen(true)}
      >
        <PowerIcon />
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Close the web UI?</AlertDialogTitle>
            <AlertDialogDescription>
              Closes this tab. A foreground "dbm web" server also stops (any "dbm connect" waiting for a
              credential fails immediately instead of timing out); the background daemon keeps running.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm}>Close</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
