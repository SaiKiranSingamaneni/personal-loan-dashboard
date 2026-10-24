# Personal Loan Dashboard

A local-first, single-user dashboard for tracking loans, property funding, payments, and repayment plans. The web app and API run on your machine; application data is stored in SQLite and no telemetry or third-party runtime services are used.

Each loan is organized into four sections: **Dashboard** for a plain-language summary and property/funding charts, **Activity** for recording and reviewing transactions, **Analysis** for repayment charts and the amortization table, and **Loan details** for loan terms and itemized property costs.

## Requirements

- Node.js LTS with npm

## Setup and run

```sh
npm ci
npm run dev
```

Open the Vite address printed in the terminal (normally `http://127.0.0.1:5173`). The API listens on `127.0.0.1:3001`; Vite proxies `/api` requests to it. The first run creates `data/loans.db` and a startup backup in `data/backups/`.

The database is empty on a fresh install. To add two example loans for local development, stop the app and run:

```sh
npm run seed --workspace @loan-dashboard/api
```

The seed command uses the same `DATABASE_PATH` setting as the API and does not add rows when loans already exist.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Run the API and web development server together. |
| `npm run build` | Type-check all workspaces and create the production web build. |
| `npm run test` | Run unit, API integration, UI, and generated-dataset performance tests. |
| `npm run lint` | Run ESLint. |
| `npm run typecheck` | Run the TypeScript project build checks. |
| `npm run verify` | Run typecheck, lint, and tests. |
| `npm run seed --workspace @loan-dashboard/api` | Add the two demo loans if the selected database has no loans. |

The SQLite file defaults to `./data/loans.db`. Set `DATABASE_PATH` before starting the app to use another file. For example:

```sh
DATABASE_PATH="$PWD/local-data/loans.db" npm run dev
```

The backup directory defaults to a `backups/` folder next to the configured database file. The application creates a backup before the API starts and every 24 hours while it runs. In the app, **Data and backups** also provides a manual backup, full JSON export/import, and a validation preview before replacing stored data.

## Project structure

```text
apps/
  api/       Express API, SQLite connection/migrations, repositories, and backup service
  web/       React/Vite application and dashboard views
packages/
  shared/    Shared Zod schemas, types, money/date helpers, and loan calculations
docs/
  SPEC.md        Product and implementation requirements
  BUILD_STATE.md Phase/task progress and session notes
data/        Local SQLite database and automatic backups (ignored by Git)
```

All money is stored as integer paise. Schedule interest is rounded to the nearest paisa per period; an exact half-paisa is rounded up. The last installment is adjusted so a fully repaid schedule closes at zero.

## Loan sections

- **Dashboard** starts with six summary cards and a plain-language, three-way funding summary. Three pies show the cost of the flat by item, who pays (loan, self-paid through the bank, and cash), and the existing loan breakdown. Select the information button on **Total property cost** for the full tier-by-tier amount and funding breakdown.
- **Activity** records self contributions, loan disbursements, EMI and extra-EMI payments, and rate changes. Automatic historical EMI entries are marked `Auto`; editing one preserves it as a user-edited entry. Filters, totals, and pagination are applied by the API. Deleted entries can be restored from **Trash**.
- **Analysis** contains the existing balance, principal/interest, cumulative interest, payment history, prepayment comparison, what-if simulator, and amortization schedule views.
- **Loan details** edits loan terms and property details across four cards: property facts, the agreement grand total, additional charges, and a separate cash component. The loan is part of the agreement grand total; self-paid bank funding covers the rest of that total and additional charges; cash is separate. The final cost is the sum of all three tiers. Amounts are entered in rupees and stored as integer paise. GST is entered as a cost amount; no GST rate is assumed. Area, agreement totals, and note totals are cross-checks that show warnings without blocking saves.

Property cost terms use these plain-language meanings in the dashboard glossary. Actual treatment can vary by contract, so check your agreement:

- **Grand total:** Usually the amount stated for the agreement, including GST; check your agreement.
- **GST:** Usually tax charged on the agreement value; check the amount on your agreement or demand letter.
- **Corpus fund:** Usually a shared reserve collected for the building or community; check your agreement.
- **Documentation + deposit:** Usually paperwork charges and deposits collected separately; check whether each item is included in your agreement.
- **Cash component:** Usually a separate payment toward the flat; check your agreement and receipts.
- **Super built-up area:** Usually the agreement area that includes a share of common spaces; check the area definition in your agreement.

The SQLite migrations preserve the existing payment, funding, rate-change, and property-cost records while converting older property groups into the agreement, additional, and cash tiers. Legacy source tables and version-1 JSON imports remain supported; newly exported files also contain property details, tiered cost components, and unified Activity records.

## Data, backups, and restore

The default database is `data/loans.db`. SQLite uses WAL mode. Automatic backups are named `loans-YYYYMMDD-HHmm.db`, and the 30 newest backups are kept. Backups use SQLite's online backup API, so they include a consistent snapshot even when WAL is active.

To restore a database backup:

1. Stop the app with `Ctrl+C` so SQLite has no open connections.
2. Keep a copy of the current database if you may need to undo the restore.
3. Copy the selected backup over the configured database file. For the default path:

   ```sh
   cp ./data/backups/loans-YYYYMMDD-HHmm.db ./data/loans.db
   ```

   Replace the timestamp with the actual backup filename. If `DATABASE_PATH` is set, copy over that file instead.
4. Start the app again with `npm run dev`.

You can also use **Data and backups → Export all data** to save a versioned JSON export. To restore from JSON, choose the file in **Import**, review the validation preview, then confirm overwrite. JSON import replaces current records; it does not merge them. Payment and amortization schedules can be exported separately as per-loan CSV files.

The `data/` directory is ignored by Git. Keep a copy of important backups outside the computer that runs the app if you need protection from device loss.

## Switching the repository to Postgres

This version runs on SQLite only. There is no Postgres driver, `DATABASE_URL` setting, or automatic SQLite-to-Postgres migration yet. The repository boundary keeps most API and loan-calculation logic independent of SQLite, but changing databases still requires implementing and validating a second repository adapter.

When adding Postgres support:

1. Add a Postgres driver and Drizzle Postgres schema/migrations that preserve the current entity fields, integer-paise money values, ISO date-only values, soft-delete behavior, and transaction guarantees.
2. Implement the existing repository interfaces in `apps/api/src/db/repositories.ts` for Postgres, including all loan-scoped child and Trash operations.
3. Add a repository factory selected by configuration, such as `DATABASE_CLIENT=postgres`, and read credentials from `DATABASE_URL`. Keep SQLite as the default and preserve `DATABASE_PATH` for local use.
4. Extend the API integration suite to run against both adapters, then run `npm run verify` before switching a personal dataset.
5. Move data using the versioned JSON export/import flow: export from SQLite, verify the import preview against Postgres, then import after confirming the destination. Compare all exported entities before retiring the SQLite copy.

Postgres hosting and credentials are not part of the current offline/local runtime. Do not point this version at a remote database until the adapter, configuration, and deployment access controls have been implemented and tested.
