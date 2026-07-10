import { createRoute, type OpenAPIHono } from "@hono/zod-openapi";
import type { UnlockBroker } from "../unlock-broker.js";

const shutdownRoute = createRoute({
  method: "post",
  path: "/api/shutdown",
  responses: {
    204: { description: "Shutdown requested; the server will close shortly" },
  },
});

// Lets the browser stop the local server (button in the header / unlock
// screen) instead of requiring Ctrl+C in the terminal. Any CLI process
// still waiting on a credential (see unlock-broker.ts) is rejected first,
// so "db-cli connect" fails fast with a clear message instead of hanging
// until its 5-minute timeout.
export function registerShutdownRoutes(app: OpenAPIHono, broker: UnlockBroker, onShutdownRequest: () => void): void {
  app.openapi(shutdownRoute, async (c) => {
    broker.rejectAll("Web UI closed by the user.");
    // Respond before tearing down the HTTP server so the browser's fetch
    // resolves cleanly instead of racing the socket closing underneath it.
    setImmediate(() => onShutdownRequest());
    return c.body(null, 204);
  });
}
