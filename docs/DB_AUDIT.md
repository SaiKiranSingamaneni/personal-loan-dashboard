# Database Audit

Audit performed: 2026-10-24. This is a read-only inventory for H-T0; no application code was changed.

## Database path

`openSqliteDatabase()` in `apps/api/src/db/connection.ts` accepts an explicit path, otherwise uses `DATABASE_PATH`, otherwise defaults to `./data/loans.db`. It resolves non-memory paths with Node's `path.resolve()`. The relative default is therefore derived from `process.cwd()` rather than from a fixed repository root. Starting the API with different working directories can select different database files. The current workspace does not contain a `.loan-dashboard-root` marker.

## SQLite connection and pragmas

The API uses `better-sqlite3` through Drizzle's better-sqlite3 adapter. The runtime connection applies `foreign_keys = ON` and `journal_mode = WAL`. `synchronous` is not set explicitly, and `busy_timeout` is not configured. Migrations `0001_initial.sql` and `0008_property_three_tier_costs.sql` also request `foreign_keys = ON`.

## Migrations and backups

`openSqliteDatabase()` runs all unapplied, lexically sorted SQL migrations before returning the connection. `initializeApi()` in `apps/api/src/server.ts` then creates the startup backup. Consequently, the existing startup backup is taken after migrations, not before them.

`BackupService` in `apps/api/src/db/backup.ts` uses `better-sqlite3`'s `database.backup(target)` API. It does not use `fs.copyFile`, `cp`, or another live database file copy, so the current backup mechanism is not a live-file-copy hazard. Backups are timestamped, and retention keeps the latest 30 by filename. The service does not verify snapshots, keep a manifest/checksum, use a mirror, or protect pre-migration snapshots. A second backup interval runs every 24 hours after startup.

## Browser storage

The only runtime browser business-adjacent storage key found in `apps/web/src` is `localStorage["loan-theme"]`, storing `"dark"` or `"light"`. Loan and activity records are fetched through the API. No runtime `sessionStorage` or IndexedDB use was found. Tests clear local storage as cleanup; that is not application business data.

## IDs

Application tables use text primary keys rather than integer autoincrement IDs. Most API-created IDs use `crypto.randomUUID()`. Other IDs are deterministic or imported: automatic EMI IDs use `auto-emi:<loanId>:<date>`, seed rows use fixed demo IDs, and migration-created Activity IDs use legacy-prefixed source IDs. `property_details` uses `loan_id` as its primary key.

## Filesystem and cloud-sync location

The resolved workspace path is `/Users/kiransingamaneni/Projects/personal-loan-dashboard`. It is a regular directory (not a symlink); the mounted filesystem reports `/` on macOS's local `/System/Volumes/Data` volume. The path is not under a conventionally named OneDrive, Dropbox, Google Drive, or `Library/Mobile Documents` directory, and no matching network mount was visible in the mount listing. Based on those checks, it does not appear to be inside a cloud-synced folder or network share. Filesystem inspection cannot prove that an external sync client has not been configured to sync this arbitrary `Projects` directory, so that remains a machine-level check.

## H-T0 findings

- [ ] Database path is independent of `process.cwd()`.
- [x] Current backup uses SQLite's online backup API, not a live `.db`/WAL file copy.
- [ ] A backup is taken before startup migrations.
- [ ] Durability pragmas include explicit `synchronous = FULL` and `busy_timeout`.
- [ ] Root marker `.loan-dashboard-root` exists.
- [x] No application business records are stored in browser storage.