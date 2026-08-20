import { spawn } from "node:child_process";
import { mkdirSync, openSync, readFileSync, unlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getConfigDirectory, getDaemonLogFilePath, getDaemonPort, getDaemonStateFilePath } from "../config/paths.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// dist/adapters/daemon-manager.js -> dist/daemon/main.js
const DEFAULT_DAEMON_MAIN_PATH = path.join(__dirname, "..", "daemon", "main.js");

type DaemonState = { pid: number; port: number; token: string; startedAt: number };

type HealthInfo = { pid: number; uptimeMs: number; cachedCount: number };

export type DaemonStatus =
  | { running: true; pid: number; port: number; uptimeMs: number; cachedCount: number }
  | { running: false };

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function health(baseUrl: string, token: string, timeoutMs = 500): Promise<HealthInfo | undefined> {
  try {
    const response = await fetch(`${baseUrl}/api/daemon/health`, {
      headers: { "x-dbm-cli-token": token },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return undefined;
    return (await response.json()) as HealthInfo;
  } catch {
    return undefined;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Coordinates the background daemon's lifecycle: spawning it detached,
// checking whether it's alive, and stopping it gracefully. Cross-process
// state lives in a single JSON file (defaults to config/paths.ts's daemon
// state path, injectable for tests); the fixed TCP port doubles as the only
// lock we need — a losing spawn just hits EADDRINUSE and exits (see
// daemon/server.ts), so no separate lock file.
export class DaemonManager {
  constructor(
    private readonly stateFilePath: string = getDaemonStateFilePath(),
    private readonly logFilePath: string = getDaemonLogFilePath(),
    private readonly port: number = getDaemonPort(),
    private readonly daemonMainPath: string = DEFAULT_DAEMON_MAIN_PATH,
  ) {}

  private readState(): DaemonState | undefined {
    try {
      return JSON.parse(readFileSync(this.stateFilePath, "utf8")) as DaemonState;
    } catch {
      return undefined;
    }
  }

  private removeStateFile(): void {
    try {
      unlinkSync(this.stateFilePath);
    } catch {
      // already gone
    }
  }

  async status(): Promise<DaemonStatus> {
    const state = this.readState();
    if (!state || !isProcessAlive(state.pid)) return { running: false };

    const info = await health(`http://127.0.0.1:${state.port}`, state.token);
    if (!info) return { running: false };

    return { running: true, pid: info.pid, port: state.port, uptimeMs: info.uptimeMs, cachedCount: info.cachedCount };
  }

  /** Returns how to reach the daemon if one is already running, else undefined (never starts it). */
  async getRunning(): Promise<{ baseUrl: string; token: string } | undefined> {
    const state = this.readState();
    if (!state) return undefined;
    const baseUrl = `http://127.0.0.1:${state.port}`;
    const info = await health(baseUrl, state.token);
    return info ? { baseUrl, token: state.token } : undefined;
  }

  /** Starts the daemon if it isn't already running, and returns how to reach it. */
  async ensureStarted(): Promise<{ baseUrl: string; token: string }> {
    const baseUrl = `http://127.0.0.1:${this.port}`;

    const existing = this.readState();
    if (existing) {
      const info = await health(baseUrl, existing.token);
      if (info) return { baseUrl, token: existing.token };
    }

    mkdirSync(getConfigDirectory(), { recursive: true });
    const logFileDescriptor = openSync(this.logFilePath, "a");
    spawn(process.execPath, [this.daemonMainPath], {
      detached: true,
      stdio: ["ignore", logFileDescriptor, logFileDescriptor],
    }).unref();

    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      const state = this.readState();
      if (state) {
        const info = await health(baseUrl, state.token);
        if (info) return { baseUrl, token: state.token };
      }
      await sleep(100);
    }

    throw new Error(`Timed out waiting for the dbm-cli daemon to start. Check ${this.logFilePath} for details.`);
  }

  /** Returns true if a running daemon was stopped, false if none was running. */
  async stop(): Promise<boolean> {
    const state = this.readState();
    if (!state || !isProcessAlive(state.pid)) {
      this.removeStateFile();
      return false;
    }

    try {
      await fetch(`http://127.0.0.1:${state.port}/api/daemon/shutdown`, {
        method: "POST",
        headers: { "x-dbm-cli-token": state.token },
        signal: AbortSignal.timeout(2000),
      });
    } catch {
      // Fall through to the liveness poll / force-kill below.
    }

    const deadline = Date.now() + 3000;
    while (Date.now() < deadline && isProcessAlive(state.pid)) {
      await sleep(100);
    }

    if (isProcessAlive(state.pid)) {
      try {
        process.kill(state.pid);
      } catch {
        // Already gone.
      }
    }

    this.removeStateFile();
    return true;
  }

  async restart(): Promise<void> {
    await this.stop();
    await this.ensureStarted();
  }
}
