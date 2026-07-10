# db-cli

`db-cli` is a command-line tool for managing and connecting to relational databases across multiple environments. Connection metadata lives in `~/.db-cli/connections.json` (plain text — no passwords). Credentials (username/password per connection) live encrypted in `~/.db-cli/credentials.enc`, unlocked through a local web UI (`db-cli web`) with a master password. Decryption happens entirely in the browser via WebCrypto — the CLI process never sees the master password or any credential it isn't actively using to connect. At connect time it spawns the appropriate official vendor client (`sqlcmd`, `sqlplus`, `mariadb`, or `psql`) with the resolved password injected the way each client expects.

---

## Prerequisites

- **Node.js 20+**
- A modern browser (for the local web UI)
- The relevant vendor client binary available on `PATH` (or installed via `db-cli client-install`) for each engine you intend to use:

| Engine     | Required binary |
|------------|-----------------|
| `mssql`    | `sqlcmd`        |
| `oracle`   | `sqlplus`       |
| `mariadb`  | `mariadb`       |
| `postgres` | `psql`          |

---

## Installation

```bash
# Install globally from the project directory
npm install -g .

# Or run directly without installing
node ./dist/index.js <command>
```

---

## Usage

### Manage connections and credentials (web UI)

```bash
db-cli web
```

Opens `http://127.0.0.1:4319` in your default browser. On first run you'll be asked to set a master password (this encrypts an empty credentials store). On later runs you unlock with that same master password.

From the web UI you can:
- Create, edit, and delete connections (host, port, database, engine, environment, read-only flag).
- Create, edit, and delete the username/password credential for each connection.
- Reassign or remove orphaned credentials left behind after a CLI rename (see below).
- Change the master password from Settings — re-encrypts the whole vault with a new password after verifying the current one.
- Close the web UI from a button in the header (or the unlock screen) instead of returning to the terminal to press Ctrl+C.

The master password and every decrypted credential stay in browser memory only — nothing is persisted beyond the encrypted `credentials.enc` blob.

### List all saved connections

```bash
db-cli list
db-cli list --env production   # filter by environment
```

Output is grouped by connection name, showing each environment as a row:

```
● mydb  [postgres]
  development   dev.host:5432/mydb_dev
  production    prod.host:5432/mydb

● reporting  [mssql]
  staging       sql.host:1433/reports   [read-only]
```

### Create a connection

```bash
db-cli create \
  --name mydb \
  --engine postgres \
  --host localhost \
  --port 5432 \
  --database myapp \
  --environment development
```

`create` only saves connection metadata. Run `db-cli web` afterwards to add the credential.

### Update an existing connection

```bash
db-cli update mydb development --host newhost --port 5433
```

`environment` is the second positional argument — it identifies which environment entry to update. Engine cannot be changed via update; delete and recreate if needed.

Renaming (`--rename`) only affects `connections.json`; it cannot touch the encrypted `credentials.enc` blob. After a rename, open `db-cli web` and use the orphaned-credentials panel to reassign the old `name:environment` credential entry to the new name.

### Delete a connection

```bash
db-cli delete mydb development
```

Deletes only the specified environment entry. Other environments of the same connection name are unaffected. The associated credential (if any) is left in `credentials.enc` as an orphan — remove it from the web UI if it's no longer needed.

### Connect to a database

```bash
db-cli connect mydb                  # defaults to development
db-cli connect mydb production       # explicit environment
db-cli connect mydb -e "SELECT 1"    # run a query non-interactively
```

Connecting to `production` requires typing `yes` at a confirmation prompt. If no entry is found for the given environment, available environments are shown.

If a credential is needed, `connect` starts the local web server (if not already running), opens your browser to the unlock screen, and waits. Once you enter the master password, the browser decrypts just that one credential and hands it back to the CLI process — which passes it straight to the database client without ever printing it.

### Install database client binaries

```bash
db-cli client-install postgres   # download psql to ~/.db-cli/clients/
```

---

## Supported Engines

| Engine     | Client binary | Password injection          | Read-only support      |
|------------|---------------|-----------------------------|------------------------|
| `mssql`    | `sqlcmd`      | `SQLCMDPASSWORD` env var    | Not enforced by client |
| `oracle`   | `sqlplus`     | `CONNECT` string via stdin  | Not enforced by client |
| `mariadb`  | `mariadb`     | `MYSQL_PWD` env var         | Session `SET transaction_read_only` |
| `postgres` | `psql`        | `PGPASSWORD` env var        | `PGOPTIONS` env var    |

---

## Configuration Storage

All files are stored under `~/.db-cli/`:

| File | Contents |
|------|----------|
| `connections.json` | Connection metadata (no passwords), versioned envelope |
| `credentials.enc` | Encrypted (AES-256-GCM, PBKDF2-derived key) credentials, keyed by `name:environment` |
| `clients/` | Database client binaries installed via `client-install` |

`connections.json` format (v2, versioned envelope):

```json
{
  "version": 2,
  "connections": {
    "mydb": {
      "engine": "postgres",
      "environments": {
        "development": { "host": "dev.host", "port": 5432, "database": "mydb_dev" },
        "production":  { "host": "prod.host", "port": 5432, "database": "mydb" }
      }
    }
  }
}
```

`credentials.enc` format:

```json
{
  "version": 1,
  "kdf": { "algorithm": "PBKDF2", "hash": "SHA-256", "iterations": 210000, "salt": "<base64>" },
  "cipher": "AES-GCM",
  "iv": "<base64>",
  "ciphertext": "<base64>"
}
```

The decrypted plaintext (browser-only) is `{ "<name>:<environment>": { "username": "...", "password": "..." }, ... }`. Passwords are never written to disk in plaintext, and the CLI process never decrypts this file.

---

## Local API

`db-cli web` exposes a local-only Hono API on `127.0.0.1`, documented via an OpenAPI 3.1 document at `GET /api/openapi.json` (generated from the same zod schemas used to validate requests — no separate API docs UI). Every route except that one requires an `x-db-cli-token` header with the session token printed when the server starts.

---

## License

MIT
