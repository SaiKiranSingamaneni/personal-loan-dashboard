# Database Audit

Audit updated: 2026-10-24 after H-T1b.

## Database path

`openSqliteDatabase()` in `apps/api/src/db/connection.ts` uses an explicit path only for internal tests and tools. Normal app startup resolves the absolute path from `DB_DIR`, defaulting to `<repo>/db/data/loans.db`; repository root discovery uses `.loan-dashboard-root` and the workspace `package.json`, never `process.cwd()`. `DATABASE_PATH` is rejected with a clear error and is not used by relocation candidate detection. Production backups resolve to `<DB_DIR>/backups`, regardless of process working directory.

## SQLite connection and pragmas

The API uses `better-sqlite3` through Drizzle's better-sqlite3 adapter. Every connection sets `journal_mode = WAL`, `synchronous = FULL`, `foreign_keys = ON`, and `busy_timeout = 5000`.

## Migrations and backups

`openSqliteDatabase()` runs unapplied, lexically sorted SQL migrations before returning the connection. Each migration runs in an immediate transaction. Before any pending migration, the runner takes and verifies a SQLite online backup named `pre-migration-<timestamp>-<schemaVersion>.db`; failure to create or verify it aborts migration. These named pre-migration snapshots are excluded from ordinary count-based pruning. Migrations 0005 and 0008 are table-rebuild migrations; before H-T1b they did not run `foreign_key_check` after the rebuild. The runner now runs `PRAGMA foreign_key_check` inside each of those migration transactions and rolls back on violations. Startup snapshots are verified and reused for up to ten minutes only when the database and WAL have not changed since that snapshot.

`BackupService` in `apps/api/src/db/backup.ts` uses `better-sqlite3`'s online backup API to a temporary file, verifies `integrity_check` and row counts, then renames atomically. Ordinary backups retain the latest 30; pre-migration snapshots are excluded. The service does not yet have the H-T4 manifest/checksum and tiered retention or H-T5 mirror. A second backup interval runs every 24 hours after startup.

## Browser storage

The only runtime browser business-adjacent storage key found in `apps/web/src` is `localStorage["loan-theme"]`, storing `"dark"` or `"light"`. Loan and activity records are fetched through the API. No runtime `sessionStorage` or IndexedDB use was found. Tests clear local storage as cleanup; that is not application business data.

## IDs

Application tables use text primary keys rather than integer autoincrement IDs. Most API-created IDs use `crypto.randomUUID()`. Other IDs are deterministic or imported: automatic EMI IDs use `auto-emi:<loanId>:<date>`, seed rows use fixed demo IDs, and migration-created Activity IDs use legacy-prefixed source IDs. `property_details` uses `loan_id` as its primary key.

## Filesystem and cloud-sync location

The resolved workspace path is `/Users/kiransingamaneni/Projects/personal-loan-dashboard`. It is a regular directory (not a symlink); the mounted filesystem reports `/` on macOS's local `/System/Volumes/Data` volume. The path is not under a conventionally named OneDrive, Dropbox, Google Drive, or `Library/Mobile Documents` directory, and no matching network mount was visible in the mount listing. Based on those checks, it does not appear to be inside a cloud-synced folder or network share. Filesystem inspection cannot prove that an external sync client has not been configured to sync this arbitrary `Projects` directory, so that remains a machine-level check.

## H-T0 findings

- [x] Database path is independent of `process.cwd()`.
- [x] Current backup uses SQLite's online backup API, not a live `.db`/WAL file copy.
- [x] A verified backup is taken before pending migrations.
- [x] Durability pragmas include explicit `synchronous = FULL` and `busy_timeout`.
- [x] Root marker `.loan-dashboard-root` exists.
- [x] No application business records are stored in browser storage.

## H-T1b migration and live database checks

- Migrations execute in immediate transactions. Before migration, a SQLite backup API snapshot is verified by `integrity_check` and per-table row counts; failure aborts migration.
- Migrations 0005 and 0008 now run `foreign_key_check` after their table rebuilds, before committing their transaction. Violations abort and roll back the migration.
- Read-only live database check on 2026-10-24: `PRAGMA integrity_check` returned `ok`; `PRAGMA foreign_key_check` returned no rows.
- `DATABASE_PATH` is no longer a selector; setting it now fails with guidance to use `DB_DIR`. Production and default backup paths derive from `DB_DIR/backups`, independent of working directory.
