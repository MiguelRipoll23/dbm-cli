# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-06-30

### Added

- `list` command — display all saved database connections with engine, host, port, and database name.
- `create` command — save a new named database connection (engine, host, port, database, username, KeePassXC vault path, and KeePassXC entry path).
- `update` command — modify any field of an existing connection by name.
- `delete` command — remove a saved connection by name.
- `connect` command — retrieve the password from KeePassXC at runtime and spawn the appropriate vendor client in the terminal.
- KeePassXC integration via `keepassxc-cli`: passwords are fetched from a KeePassXC vault at connect time and are never stored on disk.
- JSON-based connection config storage in the OS config directory (`~/.config/db-cli/connections.json` on Linux/macOS, `%APPDATA%\db-cli\connections.json` on Windows) via `env-paths`.
- Per-engine vendor client support: `sqlcmd` (MSSQL), `sqlplus` (Oracle), `mariadb` (MariaDB/MySQL), `psql` (PostgreSQL).
- Cross-platform master password masking: reads `KEEPASSXC_MASTER` env var or prompts interactively with echo suppression via readline.
