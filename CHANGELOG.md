# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.10.0] - 2026-08-18

### Changed

- Config directory renamed from `~/.dbm-cli/` to `~/.dbm/`, aligning it with the `dbm` executable name.

### Breaking Changes

- Config directory moved from `~/.dbm-cli/` to `~/.dbm/` with **no automatic migration**. Existing connections (`connections.db`), the encrypted vault (`credentials.enc`), and installed client binaries (`clients/`) must be moved manually, e.g. `mv ~/.dbm-cli ~/.dbm`, or they will appear empty.

## [0.9.0] - 2026-07-22

### Added

- On unlock, the web UI now pushes **every** decrypted credential into the daemon's in-memory cache (new `POST /api/daemon/credentials/prime`), KeePassXC-style. While the daemon is running and the vault is unlocked, `dbm connect` to **any** connection resolves straight from the cache without reopening the browser — previously only the specific connection whose unlock triggered the browser got cached. Editing or deleting a credential re-syncs the cache (prime is authoritative — it mirrors the whole vault, so a deleted connection's credential is dropped from the cache immediately instead of lingering until its TTL). The foreground `dbm web` server forwards prime to a running daemon (or no-ops when none is running), so credentials edited there don't leave `dbm connect` serving a stale password. Cached passwords still live in memory only and honor the same 30-minute sliding TTL.

### Changed

- Renamed the tool from `db-cli` to `dbm-cli`: the executable is now `dbm` (was `db-cli`) and all data moved to `~/.dbm-cli/` (was `~/.db-cli/`).

### Breaking Changes

- Config directory moved from `~/.db-cli/` to `~/.dbm-cli/` with **no automatic migration**. Existing connections (`connections.db`), the encrypted vault (`credentials.enc`), and installed client binaries (`clients/`) must be moved manually, e.g. `mv ~/.db-cli ~/.dbm-cli`, or they will appear empty.

## [0.8.0] - 2026-07-21

### Added

- Background daemon (`dbm daemon start|stop|status|restart`), similar in spirit to `systemctl`, that owns the browser-based password-unlock flow and caches decrypted connection passwords **in memory only** (never persisted to disk). `dbm connect` now auto-starts the daemon on first use — repeat connects to the same connection skip opening the browser entirely as long as the daemon is running.
- Cached passwords expire after 30 minutes of inactivity per connection (sliding TTL), and are always discarded on `daemon stop`/`daemon restart`. This is documented directly in the CLI help text for `daemon`, `daemon stop`, and `connect`.
- `dbm daemon status` reports whether the daemon is running (PID, port, uptime) and how many passwords are currently cached.

### Changed

- `WebSecretResolver` no longer starts its own per-invocation web server; it now delegates to the daemon (starting it if needed) via a new `DaemonManager`/`DaemonClient` pair of adapters. `dbm web` is unaffected — it remains a one-off foreground session for browsing/editing connections and credentials.

### Fixed

- Web UI credential forms (create-connection, change-credentials, and the connect-time "credential needed" prompt) now trim leading/trailing whitespace from username and password before saving. An untrimmed value previously saved silently and broke engines whose CLI syntax uses whitespace as a token separator — e.g. Oracle's `CONNECT user/pass@host:port/service`, which fails with `SP2-0306: Invalid option` if either field has a stray space.

## [0.7.0] - 2026-07-12

### Added

- Connections now track `createdAt` and `updatedAt` timestamps (ISO-8601), stamped server-side on create/update. Existing `connections.db` files are migrated automatically and idempotently on startup: the two columns are added and backfilled with the current time for any pre-existing row.
- `GET /api/connections` now accepts `search`, `sortBy` (`name` | `createdAt` | `updatedAt`), `sortDir` (`asc` | `desc`), `page`, and `pageSize` query params, and returns `{ items, total, page, pageSize }` instead of a bare array. Search matches (case-insensitive) across `name`, `host`, and `database`. All filtering/sorting/pagination runs in SQLite — the web UI no longer fetches the full list and filters client-side.
- Web UI: the connections table has a search box, sortable Name/Created/Modified column headers, and a pagination footer ("Showing X–Y of N" with Previous/Next), all backed by the new query params.
- Web UI: closing the web UI via the header button now also closes the browser tab (`window.close()`) after the server shuts down, falling back to the existing "you can close this tab" screen in browsers that block script-initiated tab closes.

### Breaking Changes

- `GET /api/connections` response shape changed from `Connection[]` to `{ items: Connection[], total: number, page: number, pageSize: number }`.
- `ConnectionRepository.list()` and `ConnectionService.list()` now take an optional `ConnectionListQuery` and return a `ConnectionListResult` instead of `Connection[]`.

## [0.6.0] - 2026-07-10

### Removed

- OpenAPI document generation (`@hono/zod-openapi`, `GET /api/openapi.json`). Nothing consumed it — the web UI already talks to the API through a hand-written fetch client. Routes now use plain Hono with manual zod validation (`schema.safeParse`); request/response shapes and status codes are unchanged.
- One-time `connections.json` → SQLite migration (`migrate-json-to-sqlite`), the legacy JSON reader (`json-connection-repository`, supporting the old v0/v1/v2 on-disk formats), and the credential-rekey flow it produced (`GET /api/credentials/rekey-map`, `getCredentialRekeyMapPath`, and the frontend rekey step in `vault-context.tsx`). Anyone still on `connections.json` should upgrade through `0.5.x` first to run the migration before updating further. `connections.db` (SQLite) remains the active store — untouched by this change.

### Changed

- Updated all dependencies to latest, including major version bumps: TypeScript 5 → 7, `citty` 0.1 → 0.2, `@types/node` 22 → 26 (root) and 24 → 26 (web).

## [0.5.0] - 2026-07-10

### Added

- Connection storage migrated from `connections.json` to SQLite (`~/.db-cli/connections.db`, via Node's built-in `node:sqlite`). Every connection now has a stable `id` (uuid), generated once and never changed — renaming a connection or changing its engine/environment is now a plain field update, no longer a costly move across the whole JSON structure.
- Web UI: the edit-connection dialog now allows changing every field, including `name`, `engine`, and `environment` (previously fixed).
- Web UI: a dedicated "Change credentials" dialog, opened from a button in the edit-connection form, replacing the confusing `(optional)` username/password fields and the "leave blank to keep the existing credential" hint that used to sit in the modal description.
- Automatic, idempotent migration from `connections.json` to SQLite on CLI startup: the legacy file (any of the v0/v1/v2 formats) is imported, backed up to `connections.json.bak`, and removed. A one-time `credential-rekey.json` map is generated and consumed by the web UI on next unlock to re-key the encrypted credentials vault from the old `name:environment` keys to the new stable connection ids.

### Removed

- Orphaned-credentials panel in the web UI — no longer needed, since credentials are now keyed by a connection's stable id instead of its mutable `name:environment`, so renaming or changing a connection's engine never orphans its stored credential.
- `ConnectionRepository.rename()` — renaming is now a regular field update (`update` with a new `name`).

### Breaking Changes

- Requires **Node.js >= 22** (for `node:sqlite`).
- Web API: connection routes moved from `/api/connections/{name}/{environment}` to `/api/connections/{id}`. `PUT` now accepts any connection field (including `name`, `engine`, `environment`) instead of a separate `rename` field.
- `connections.json` is retired in favor of `connections.db`; existing installs are migrated automatically on first run (see Added above).

## [0.4.0] - 2026-07-10

### Added

- Settings dialog in the web UI to change the master password: verifies the current password, then re-encrypts the whole credentials vault with a new password and salt (`POST` via `PUT /api/credentials/envelope`, same as any other credential change).
- "Close web UI" button (header and unlock screen) that stops the local server via a new `POST /api/shutdown` endpoint, without needing to return to the terminal and press Ctrl+C. Any `db-cli connect` still waiting for a credential is rejected immediately with a clear message instead of hanging until its 5-minute timeout.

### Removed

- Random password generator button (the dice icon) from the password inputs — browsers' own password managers already cover this, so master-password and connection-password fields now show only the show/hide toggle.

## [0.3.0] - 2026-07-10

### Added

- `web` command — opens a local web UI (`http://127.0.0.1:4319` by default) to unlock and manage connections and credentials. Built with Vite + React + shadcn/ui, served as static files by the CLI.
- Encrypted local credential storage at `~/.db-cli/credentials.enc` (AES-256-GCM, PBKDF2-SHA256 key derivation, 210k iterations). Decryption happens exclusively in the browser via WebCrypto — the CLI process never sees the master password or any credential it isn't actively resolving for a `connect`.
- `connect` now auto-starts the local web server and opens the browser to the unlock screen when a credential is needed, waiting until the browser delivers the decrypted credential for that one `name:environment` pair.
- Local HTTP API (Hono) backing the web UI, with request/response validation via zod and an auto-generated OpenAPI 3.1 document at `GET /api/openapi.json` (no docs UI — the JSON document is the contract). All routes require a per-launch session token (`x-db-cli-token` header).
- `connections.json` now uses a versioned envelope (`{ version, connections }`, current version `2`). Migrations from the legacy flat format (v0) and the previous nested-without-envelope format (v1) run automatically and idempotently on load.
- Orphaned-credential detection in the web UI: after a CLI `update --rename`, credentials tied to the old name can be reassigned or removed from the unlock screen.

### Removed

- **KeePassXC integration removed entirely** — the `keepassxc-socket-resolver` adapter, the `keepass-store` command, and the KeePassXC Browser Extension IPC protocol support are gone. `~/.db-cli/keepassxc-socket.json` is no longer used.
- `tweetnacl` dependency (was only used for the KeePassXC IPC channel).

### Breaking Changes

- KeePassXC is no longer supported or required. Existing KeePassXC entries are **not** migrated automatically — re-enter credentials once via `db-cli web`.
- `keepass-store` command removed. Use `db-cli web` to manage credentials instead.
- `create` and `update` no longer prompt for or accept credentials directly — credential management moved entirely to the web UI.
- `connections.json` gained a versioned envelope; existing files are migrated automatically and idempotently on first read, no action needed.

## [0.2.0] - 2026-07-01

### Added

- `update <name> <environment> --rename <newName>` — rename a connection across all its environments. Validates the new name isn't taken and migrates any existing KeePassXC credentials to the new name (old entries must be deleted manually in KeePassXC, since the socket protocol has no delete action).

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
