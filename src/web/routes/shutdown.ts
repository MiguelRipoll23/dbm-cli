import type { Hono } from "hono";
import type { UnlockBroker } from "../unlock-broker.js";

// Lets the browser stop the local server (button in the header / unlock
// screen) instead of requiring Ctrl+C in the terminal. In the foreground
// "dbm web" server any CLI process still waiting on a credential (see
// unlock-broker.ts) is rejected first, so "dbm connect" fails fast instead
// of hanging until its 5-minute timeout. Under the daemon this route is
// fully neutralized (rejectPending=false, no-op teardown) so a stray tab
// can neither kill the daemon nor abort a connect it is legitimately serving.
export function registerShutdownRoutes(
  app: Hono,
  broker: UnlockBroker,
  onShutdownRequest: () => void,
  rejectPending = true,
): void {
  app.post("/api/shutdown", async (c) => {
    if (rejectPending) broker.rejectAll("Web UI closed by the user.");
    // Respond before tearing down the HTTP server so the browser's fetch
    // resolves cleanly instead of racing the socket closing underneath it.
    setImmediate(() => onShutdownRequest());
    return c.body(null, 204);
  });
}
