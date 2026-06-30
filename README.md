# db-cli

`db-cli` is a command-line tool for managing and connecting to relational databases across multiple environments. It stores connection configurations locally in `~/.db-cli/connections.json` and retrieves passwords at connect time from a running [KeePassXC](https://keepassxc.org/) instance via its Browser Extension IPC socket, so that credentials are never stored on disk. At connect time it spawns the appropriate official vendor client (`sqlcmd`, `sqlplus`, `mariadb`, or `psql`) with the password injected in the way each client expects.

---

## Prerequisites

- **Node.js 20+**
- **KeePassXC** running and unlocked (Browser Integration must be enabled in KeePassXC settings)
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

After creation you will be prompted to store the database password in KeePassXC. You can also manage credentials later with `keepass-store`.

### Update an existing connection

```bash
db-cli update mydb development --host newhost --port 5433
```

`environment` is the second positional argument — it identifies which environment entry to update. Engine cannot be changed via update; delete and recreate if needed.

### Delete a connection

```bash
db-cli delete mydb development
```

Deletes only the specified environment entry. Other environments of the same connection name are unaffected.

### Connect to a database

```bash
db-cli connect mydb                  # defaults to development
db-cli connect mydb production       # explicit environment
db-cli connect mydb -e "SELECT 1"    # run a query non-interactively
```

Connecting to `production` requires typing `yes` at a confirmation prompt. If no entry is found for the given environment, available environments are shown.

### Store or update KeePassXC credentials

```bash
db-cli keepass-store mydb development
db-cli keepass-store mydb production --generate   # auto-generate password
```

### Install database client binaries

```bash
db-cli client-install postgres   # download psql to ~/.db-cli/clients/
```

---

## KeePassXC Setup

`db-cli` uses the KeePassXC Browser Extension IPC protocol to retrieve passwords at connect time. No master password is needed — KeePassXC must be running and unlocked.

On first use, KeePassXC will display an association request dialog. Accept it to allow `db-cli` to read credentials. The association is cached in `~/.db-cli/keepassxc-socket.json` and reused on subsequent calls.

Credentials are stored in KeePassXC under:
- **URL:** `db-cli://<name>:<environment>` (e.g. `db-cli://mydb:development`)
- **Group:** `db-cli`

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
| `connections.json` | Connection metadata (no passwords) |
| `keepassxc-socket.json` | KeePassXC association cache |
| `clients/` | Database client binaries installed via `client-install` |

`connections.json` format:

```json
{
  "mydb": {
    "engine": "postgres",
    "environments": {
      "development": { "host": "dev.host", "port": 5432, "database": "mydb_dev" },
      "production":  { "host": "prod.host", "port": 5432, "database": "mydb" }
    }
  }
}
```

Passwords are never written to disk.

---

## License

MIT
