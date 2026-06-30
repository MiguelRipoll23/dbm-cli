# db-cli

`db-cli` is a command-line tool for managing and connecting to relational databases. It stores connection configurations locally in a JSON file (in the OS config directory) and retrieves passwords at connect time from a [KeePassXC](https://keepassxc.org/) vault via the `keepassxc-cli` binary, so that credentials are never stored on disk. At connect time it spawns the appropriate official vendor client (`sqlcmd`, `sqlplus`, `mariadb`, or `psql`) with the password injected in the way each client expects.

---

## Prerequisites

- **Node.js 20+**
- **`keepassxc-cli`** available on `PATH` (ships with KeePassXC)
- The relevant vendor client binary available on `PATH` for each engine you intend to use:

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

After a global install the `db-cli` command is available everywhere.

---

## Usage

### List all saved connections

```bash
db-cli list
```

### Create a connection

```bash
db-cli create \
  --name mydb \
  --engine postgres \
  --host localhost \
  --port 5432 \
  --database myapp \
  --username admin \
  --keepass-db /path/to/vault.kdbx \
  --keepass-entry "Databases/myapp"
```

### Update an existing connection

```bash
db-cli update mydb --host newhost --port 5433
```

### Delete a connection

```bash
db-cli delete mydb
```

### Connect to a database

```bash
db-cli connect mydb
```

This fetches the password from KeePassXC and spawns the vendor client in your terminal.

---

## KeePassXC Setup

`db-cli` uses `keepassxc-cli` to retrieve passwords from your KeePassXC vault at connect time. You need to provide the master password so it can unlock the vault.

**Option 1 — environment variable (recommended for scripting or CI):**

```bash
export KEEPASSXC_MASTER="your-master-password"
db-cli connect mydb
```

**Option 2 — interactive prompt:**

If `KEEPASSXC_MASTER` is not set, `db-cli` will prompt you for the master password at connect time. Input is masked (characters are not echoed to the terminal).

---

## Supported Engines

| Engine     | Client binary | Password injection          |
|------------|---------------|-----------------------------|
| `mssql`    | `sqlcmd`      | `SQLCMDPASSWORD` env var    |
| `oracle`   | `sqlplus`     | `CONNECT` string via stdin  |
| `mariadb`  | `mariadb`     | `MYSQL_PWD` env var         |
| `postgres` | `psql`        | `PGPASSWORD` env var        |

---

## Configuration Storage

Connection configurations are stored in a JSON file inside the OS config directory:

- **Linux / macOS:** `~/.config/db-cli/connections.json`
- **Windows:** `%APPDATA%\db-cli\connections.json`

Passwords are never written to this file.

---

## License

MIT
