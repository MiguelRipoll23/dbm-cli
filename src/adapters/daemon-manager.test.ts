import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { DaemonManager } from "./daemon-manager.js";

async function withTempDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "dbm-cli-daemon-test-"));
  try {
    await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

// A bare node:http server standing in for the real daemon's /api/daemon/health
// route, so status() can be tested without spawning a real daemon process.
function startFakeDaemon(token: string): Promise<{ port: number; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      if (req.headers["x-dbm-cli-token"] !== token) {
        res.writeHead(401).end();
        return;
      }
      if (req.url === "/api/daemon/health") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ pid: process.pid, uptimeMs: 1234, cachedCount: 2 }));
        return;
      }
      res.writeHead(404).end();
    });
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({ port, close: () => new Promise((r) => server.close(() => r())) });
    });
  });
}

describe("DaemonManager.status", () => {
  it("reports not running when no state file exists", async () => {
    await withTempDir(async (dir) => {
      const manager = new DaemonManager(path.join(dir, "daemon.json"), path.join(dir, "daemon.log"), 0, "");
      assert.deepEqual(await manager.status(), { running: false });
    });
  });

  it("reports not running when the state file's pid is dead", async () => {
    await withTempDir(async (dir) => {
      const statePath = path.join(dir, "daemon.json");
      // An implausibly high pid that's extremely unlikely to be alive — a
      // best-effort liveness check, PID reuse is a known edge case.
      await fs.writeFile(statePath, JSON.stringify({ pid: 999999, port: 1, token: "x", startedAt: Date.now() }));
      const manager = new DaemonManager(statePath, path.join(dir, "daemon.log"), 0, "");
      assert.deepEqual(await manager.status(), { running: false });
    });
  });

  it("reports running with pid/port/uptime/cachedCount when the daemon answers health", async () => {
    await withTempDir(async (dir) => {
      const token = "test-token";
      const fake = await startFakeDaemon(token);
      try {
        const statePath = path.join(dir, "daemon.json");
        await fs.writeFile(
          statePath,
          JSON.stringify({ pid: process.pid, port: fake.port, token, startedAt: Date.now() }),
        );
        const manager = new DaemonManager(statePath, path.join(dir, "daemon.log"), fake.port, "");
        const status = await manager.status();
        assert.deepEqual(status, { running: true, pid: process.pid, port: fake.port, uptimeMs: 1234, cachedCount: 2 });
      } finally {
        await fake.close();
      }
    });
  });
});

describe("DaemonManager.stop", () => {
  it("returns false and removes a stale state file when the daemon isn't running", async () => {
    await withTempDir(async (dir) => {
      const statePath = path.join(dir, "daemon.json");
      await fs.writeFile(statePath, JSON.stringify({ pid: 999999, port: 1, token: "x", startedAt: Date.now() }));
      const manager = new DaemonManager(statePath, path.join(dir, "daemon.log"), 0, "");

      const stopped = await manager.stop();
      assert.equal(stopped, false);
      await assert.rejects(fs.access(statePath));
    });
  });
});
