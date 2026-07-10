import fs from "node:fs/promises";
import path from "node:path";
import type { CredentialStore } from "../core/ports/credential-store.js";

// Reads/writes the credentials.enc envelope. This adapter never sees the
// master password or the decrypted contents — it treats the envelope as an
// opaque blob produced and consumed by the browser (WebCrypto).
export class FileCredentialStore implements CredentialStore {
  constructor(private readonly filePath: string) {}

  async readEnvelope(): Promise<string | undefined> {
    try {
      return await fs.readFile(this.filePath, "utf-8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return undefined;
      }
      throw error;
    }
  }

  async writeEnvelope(envelopeJson: string): Promise<void> {
    const directory = path.dirname(this.filePath);
    await fs.mkdir(directory, { recursive: true });
    const tmpPath = `${this.filePath}.tmp`;
    await fs.writeFile(tmpPath, envelopeJson);
    await fs.rename(tmpPath, this.filePath);
  }

  async exists(): Promise<boolean> {
    try {
      await fs.access(this.filePath);
      return true;
    } catch {
      return false;
    }
  }
}
