import { spawn } from "node:child_process";

// Cross-platform "open URL in the default browser" helper, using only
// platform-native launchers (no extra dependency for something this small).
export function openBrowser(url: string): void {
  const platform = process.platform;
  if (platform === "win32") {
    // `start` is a cmd.exe builtin; the empty-title arg avoids quoting issues with the URL.
    spawn("cmd", ["/c", "start", '""', url], { stdio: "ignore", detached: true }).unref();
  } else if (platform === "darwin") {
    spawn("open", [url], { stdio: "ignore", detached: true }).unref();
  } else {
    spawn("xdg-open", [url], { stdio: "ignore", detached: true }).unref();
  }
}
