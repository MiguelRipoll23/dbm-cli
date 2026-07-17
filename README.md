# dbm-cli

`dbm-cli` is a CLI for managing and connecting to databases across multiple environments. Connections stored in SQLite, credentials encrypted and unlocked through a local web UI with a master password.

## Installation

```bash
npx dbm-cli <command>
```

## Usage

### Manage connections and credentials (web UI)

```bash
dbm-cli web
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
dbm-cli list
dbm-cli list --env production   # filter by environment
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
dbm-cli create \
  --name mydb \
  --engine postgres \
  --host localhost \
  --port 5432 \
  --database myapp \
  --environment development
```

`create` only saves connection metadata. Run `dbm-cli web` afterwards to add the credential.

### Update an existing connection

```bash
dbm-cli update mydb development --host newhost --port 5433
```

`environment` is the second positional argument — it identifies which environment entry to update. Engine cannot be changed via update; delete and recreate if needed.

Renaming (`--rename`) only affects the connection's stored name; the credential stays attached to it, since credentials are keyed by the connection's stable id rather than its name.

### Delete a connection

```bash
dbm-cli delete mydb development
```

Deletes only the specified environment entry. Other environments of the same connection name are unaffected. The associated credential (if any) is left in `credentials.enc` as an orphan — remove it from the web UI if it's no longer needed.

### Connect to a database

```bash
dbm-cli connect mydb                  # defaults to development
dbm-cli connect mydb production       # explicit environment
dbm-cli connect mydb -e "SELECT 1"    # run a query non-interactively
```

Connecting to `production` requires typing `yes` at a confirmation prompt. If no entry is found for the given environment, available environments are shown.

If a credential is needed, `connect` starts the local web server (if not already running), opens your browser to the unlock screen, and waits. Once you enter the master password, the browser decrypts just that one credential and hands it back to the CLI process — which passes it straight to the database client without ever printing it.

### Install database client binaries

```bash
dbm-cli client-install postgres   # download psql to ~/.dbm-cli/clients/
```

## Supported Engines

| Engine     | Client binary | Password injection          | Read-only support      |
|------------|---------------|-----------------------------|------------------------|
| `mssql`    | `sqlcmd`      | `SQLCMDPASSWORD` env var    | Not enforced by client |
| `oracle`   | `sqlplus`     | `CONNECT` string via stdin  | Not enforced by client |
| `mariadb`  | `mariadb`     | `MYSQL_PWD` env var         | Session `SET transaction_read_only` |
| `postgres` | `psql`        | `PGPASSWORD` env var        | `PGOPTIONS` env var    |

## Configuration Storage

All files are stored under `~/.dbm-cli/`:

| File | Contents |
|------|----------|
| `connections.db` | Connection metadata (no passwords), SQLite, one row per connection keyed by a stable uuid |
| `credentials.enc` | Encrypted (AES-256-GCM, PBKDF2-derived key) credentials, keyed by connection id |
| `clients/` | Database client binaries installed via `client-install` |

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

The decrypted plaintext (browser-only) is `{ "<connectionId>": { "username": "...", "password": "..." }, ... }`. Passwords are never written to disk in plaintext, and the CLI process never decrypts this file.
