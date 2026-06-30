# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-06-30

### Added

- `list` command — display all saved connections grouped by name, showing each environment as a row with host, port, and database. Supports `--env` filter.
- `create` command — save a new named database connection (`--name`, `--engine`, `--host`, `--port`, `--database`, `--environment`). Prompts to store credentials in KeePassXC after creation.
- `update <name> <environment>` command — modify fields of an existing connection entry. Engine is immutable after creation.
- `delete <name> <environment>` command — remove a specific environment entry. Other environments of the same connection name are unaffected.
- `connect <name> [environment]` command — retrieve credentials from KeePassXC and spawn the vendor client. Environment defaults to `development`. Production connections require confirmation. Shows available environments on miss.
- `keepass-store <name> <environment>` command — store or update credentials in KeePassXC for a specific connection and environment. Supports `--generate` for a random password.
- `client-install` command — download and install vendor client binaries to `~/.db-cli/clients/`.
- Multi-environment support — the same connection name can exist in multiple environments (development, staging, production, local), each with different host/port/database. Engine is shared across environments.
- KeePassXC integration via Browser Extension IPC socket protocol (NaCl encryption). KeePassXC must be running and unlocked; no master password is required. Credentials are keyed per `name:environment`.
- Per-engine vendor client support with appropriate password injection: `sqlcmd` (MSSQL via `SQLCMDPASSWORD`), `sqlplus` (Oracle via stdin), `mariadb` (MariaDB via `MYSQL_PWD`), `psql` (PostgreSQL via `PGPASSWORD`).
- Read-only mode for MariaDB (`SET SESSION transaction_read_only`) and PostgreSQL (`PGOPTIONS`).
- Non-interactive query execution via `-e/--execute` flag on `connect`.
- Connection config stored at `~/.db-cli/connections.json` with atomic writes (`.tmp` rename) and one-time idempotent migration from the legacy flat format.
- KeePassXC association cached at `~/.db-cli/keepassxc-socket.json`.
- Managed binary directory at `~/.db-cli/clients/` prepended to PATH at launch.

### Breaking Changes (from pre-release versions)

- `connections.json` format changed from flat map (`{ [name]: Connection }`) to nested format (`{ [name]: { engine, environments: { [env]: entry } } }`). Automatic migration runs on first startup.
- `update` and `delete` commands now require `environment` as the second positional argument.
- `keepass-store` now requires `environment` as the second positional argument.
- KeePassXC integration now uses the Browser Extension IPC socket instead of `keepassxc-cli`. `keepassxc-cli` is no longer required.
- KeePassXC entry URLs changed from `db-cli://<name>` to `db-cli://<name>:<environment>`. Existing entries must be recreated with `keepass-store`.
