import net from "node:net";
import os from "node:os";
import path from "node:path";
import consola from "consola";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import nacl from "tweetnacl";
import type { Credentials, SecretResolver } from "../core/ports/secret-resolver.js";

// Implements the KeePassXC browser extension IPC protocol.
// https://github.com/keepassxreboot/keepassxc-browser/blob/develop/keepassxc-protocol.md
// When KeePassXC is running and unlocked, no master password prompt is needed.

type Envelope = Record<string, unknown>;
type Association = { clientID: string; idKey: string; name: string };

function toB64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

function fromB64(str: string): Uint8Array {
  return new Uint8Array(Buffer.from(str, "base64"));
}

function getSocketPath(): string {
  const env = process.env["KEEPASSXC_SOCKET"];
  if (env) return env;
  if (process.platform === "win32") {
    const username = os.userInfo().username;
    const withUser = String.raw`\\.\pipe\org.keepassxc.KeePassXC.BrowserServer_${username}`;
    if (existsSync(withUser)) return withUser;
    return String.raw`\\.\pipe\org.keepassxc.KeePassXC.BrowserServer`;
  }
  const uid = process.getuid?.() ?? 1000;
  const runPath = `/run/user/${uid}/org.keepassxc.KeePassXC.BrowserServer`;
  if (existsSync(runPath)) return runPath;
  return "/tmp/org.keepassxc.KeePassXC.BrowserServer";
}

function openSocket(): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const s = net.createConnection(getSocketPath());
    s.once("connect", () => resolve(s));
    s.once("error", reject);
  });
}

// Windows named pipes use message-mode (raw JSON per write/read).
// Linux/macOS Unix sockets use stream-mode with a 4-byte LE length prefix.
const IS_WIN = process.platform === "win32";

function writeMsg(socket: net.Socket, msg: Envelope): void {
  const body = Buffer.from(JSON.stringify(msg), "utf-8");
  if (IS_WIN) {
    socket.write(body);
  } else {
    const header = Buffer.alloc(4);
    header.writeUInt32LE(body.length, 0);
    socket.write(Buffer.concat([header, body]));
  }
}

function readMsg(socket: net.Socket): Promise<Envelope> {
  return new Promise((resolve, reject) => {
    let buf = Buffer.alloc(0);

    const onData = (chunk: Buffer) => {
      buf = Buffer.concat([buf, chunk]);
      if (IS_WIN) {
        // Named pipe delivers each message as a single data event.
        try {
          resolve(JSON.parse(buf.toString("utf-8")) as Envelope);
          socket.removeListener("data", onData);
          socket.removeListener("error", onErr);
        } catch {
          // Incomplete JSON — wait for more data.
        }
      } else {
        if (buf.length >= 4) {
          const expected = buf.readUInt32LE(0);
          if (buf.length >= expected + 4) {
            socket.removeListener("data", onData);
            socket.removeListener("error", onErr);
            try {
              resolve(JSON.parse(buf.subarray(4, 4 + expected).toString("utf-8")) as Envelope);
            } catch (e) {
              reject(e);
            }
          }
        }
      }
    };

    const onErr = (e: Error) => {
      socket.removeListener("data", onData);
      reject(e);
    };

    socket.on("data", onData);
    socket.once("error", onErr);
  });
}

export class KeepassxcSocketResolver implements SecretResolver {
  private readonly _keypair = nacl.box.keyPair();
  private readonly _clientID = toB64(randomBytes(24));
  private readonly _idKey = toB64(randomBytes(32));
  private readonly _assocPath: string;

  constructor(configDir: string) {
    this._assocPath = path.join(configDir, "keepassxc-socket.json");
  }

  private async loadAssoc(): Promise<Association | undefined> {
    try {
      return JSON.parse(await fs.readFile(this._assocPath, "utf-8")) as Association;
    } catch {
      return undefined;
    }
  }

  private async saveAssoc(assoc: Association): Promise<void> {
    const tmp = this._assocPath + ".tmp";
    await fs.writeFile(tmp, JSON.stringify(assoc, null, 2));
    await fs.rename(tmp, this._assocPath);
  }

  private encryptPayload(payload: Envelope, kpxcKey: Uint8Array): { message: string; nonce: string } {
    const nonce = nacl.randomBytes(nacl.box.nonceLength);
    const encrypted = nacl.box(
      Buffer.from(JSON.stringify(payload), "utf-8"),
      nonce,
      kpxcKey,
      this._keypair.secretKey,
    );
    return { message: toB64(encrypted), nonce: toB64(nonce) };
  }

  private decryptEnvelope(envelope: Envelope, kpxcKey: Uint8Array): Envelope {
    const opened = nacl.box.open(
      fromB64(envelope.message as string),
      fromB64(envelope.nonce as string),
      kpxcKey,
      this._keypair.secretKey,
    );
    if (!opened) throw new Error("KeePassXC: decryption failed");
    return JSON.parse(Buffer.from(opened).toString("utf-8")) as Envelope;
  }

  private async sendEncrypted(socket: net.Socket, action: string, payload: Envelope, kpxcKey: Uint8Array): Promise<Envelope> {
    const { message, nonce } = this.encryptPayload(payload, kpxcKey);
    writeMsg(socket, { action, message, nonce, clientID: this._clientID });
    const response = await readMsg(socket);
    if (!response.message || !response.nonce) {
      throw new Error(`KeePassXC error (${action}): ${JSON.stringify(response)}`);
    }
    return this.decryptEnvelope(response, kpxcKey);
  }

  private async handshake(socket: net.Socket): Promise<Uint8Array> {
    writeMsg(socket, {
      action: "change-public-keys",
      publicKey: toB64(this._keypair.publicKey),
      nonce: toB64(nacl.randomBytes(nacl.box.nonceLength)),
      clientID: this._clientID,
    });
    const r = await readMsg(socket);
    if (r.success !== "true" || !r.publicKey) {
      throw new Error("KeePassXC: key exchange failed. Is KeePassXC running with Browser Integration enabled?");
    }
    return fromB64(r.publicKey as string);
  }

  private async ensureAssociated(socket: net.Socket, kpxcKey: Uint8Array): Promise<Association> {
    const saved = await this.loadAssoc();
    if (saved) {
      try {
        const r = await this.sendEncrypted(socket, "test-associate", { id: saved.name, key: saved.idKey }, kpxcKey);
        if (r.success === "true") return saved;
      } catch {
        // stale association, re-associate
      }
    }

    consola.info("Waiting for KeePassXC approval — accept the connection request in KeePassXC.");
    const r = await this.sendEncrypted(socket, "associate", {
      key: toB64(this._keypair.publicKey),
      idKey: this._idKey,
    }, kpxcKey);

    if (r.success !== "true" || !r.id) {
      throw new Error("KeePassXC: association rejected. Accept the connection request in KeePassXC.");
    }

    const assoc: Association = { clientID: this._clientID, idKey: this._idKey, name: r.id as string };
    await this.saveAssoc(assoc);
    return assoc;
  }

  private async getLogins(name: string, environment: string): Promise<{ login: string; password: string }> {
    const entryKey = `${name}:${environment}`;
    const url = `db-cli://${entryKey.toLowerCase()}`;
    const socket = await openSocket();
    try {
      const kpxcKey = await this.handshake(socket);
      const assoc = await this.ensureAssociated(socket, kpxcKey);
      const r = await this.sendEncrypted(socket, "get-logins", {
        url,
        submitUrl: url,
        id: assoc.name,
        keys: [{ id: assoc.name, key: assoc.idKey }],
      }, kpxcKey);

      if (r.success !== "true" || !Array.isArray(r.entries) || (r.entries as unknown[]).length === 0) {
        throw new Error(
          `KeePassXC: no entry found for "${url}". ` +
          `Run "db-cli keepass-store ${name} ${environment}" to create a new one.`,
        );
      }

      const entry = (r.entries as Array<{ login: string; password: string }>)[0]!;
      return { login: entry.login, password: entry.password };
    } finally {
      socket.destroy();
    }
  }

  async resolveCredentials(name: string, environment: string): Promise<Credentials> {
    const { login, password } = await this.getLogins(name, environment);
    return { username: login, password };
  }

  async resolvePassword(name: string, environment: string): Promise<string> {
    const { password } = await this.resolveCredentials(name, environment);
    return password;
  }

  async entryExists(name: string, environment: string): Promise<boolean> {
    try {
      await this.resolveCredentials(name, environment);
      return true;
    } catch {
      return false;
    }
  }

  async storePassword(name: string, environment: string, username: string, password: string): Promise<void> {
    const entryKey = `${name}:${environment}`;
    const url = `db-cli://${entryKey.toLowerCase()}`;
    const title = `DATABASE ${name.toUpperCase()} (${environment})`;
    const socket = await openSocket();
    try {
      const kpxcKey = await this.handshake(socket);
      const assoc = await this.ensureAssociated(socket, kpxcKey);
      const r = await this.sendEncrypted(socket, "set-login", {
        url,
        submitUrl: url,
        id: assoc.name,
        login: username,
        password,
        group: "db-cli",
        groupUuid: "",
        title,
      }, kpxcKey);
      if (r.success !== "true") {
        throw new Error(`KeePassXC: failed to store password: ${JSON.stringify(r)}`);
      }
    } finally {
      socket.destroy();
    }
  }

  async editEntry(name: string, environment: string, username: string, newPassword: string): Promise<void> {
    return this.storePassword(name, environment, username, newPassword);
  }

  async deleteEntry(_name: string, _environment: string): Promise<void> {
    throw new Error("deleteEntry not supported via KeePassXC socket — delete the entry manually in KeePassXC.");
  }
}
