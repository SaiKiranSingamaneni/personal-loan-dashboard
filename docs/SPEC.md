# Personal Loan Dashboard: Requirements Spec

Single-user web app to track, visualize and plan multiple loans against property purchases. Built for personal use, local-first, data must not be lost.

## 1. Tech stack

- **Frontend:** React 18 + TypeScript, Vite, React Router, TanStack Query, Recharts, Tailwind CSS (shadcn/ui optional), React Hook Form + Zod.
- **Backend:** Node.js (LTS) + Express + TypeScript, Zod validation shared with the frontend.
- **Database:** SQLite (file-based, `better-sqlite3`) with Drizzle ORM or Prisma and versioned migrations. Data access goes through a repository layer so the DB can later move to Postgres (Azure/AWS free tier) without touching business logic.
- **Monorepo:** `/apps/web`, `/apps/api`, `/packages/shared` (types, Zod schemas, amortization engine).
- **Tests:** Vitest. Playwright optional for one smoke flow.
- **Run:** one command (`npm run dev`) starts web + API. API binds to `127.0.0.1` only. No auth (single user, local).

## 2. Data safety

- All data in a single SQLite file at a configurable path (default `./data/loans.db`), outside source control (`.gitignore`).
- Automatic backup: copy DB to `./data/backups/loans-YYYYMMDD-HHmm.db` on server start and once daily while running. Keep the last 30.
- Manual **Export all data** (JSON) and **Import** (JSON, with validation and a preview before overwrite). Per-loan **Export CSV** for payments and the amortization schedule.
- SQLite WAL mode on. All multi-row writes in transactions.
- Soft delete for loans, payments and notes (restore from a Trash view). Hard delete only from Trash with confirmation.
- Money stored as integer minor units (paise). Dates stored as ISO `YYYY-MM-DD` with no time zone. Never use floating point for stored money.

## 3. Domain model

**Loan**

- name, lender, loan type (home, plot, vehicle, personal, other), account/reference no. (optional), status (active, closed).
- sanctioned amount, annual interest rate %, rate type (fixed or floating), tenure in months, start date, EMI due day of month, EMI (auto-calculated, manual override allowed).
- processing fee and other upfront charges (optional).

**Property funding (optional per loan)**

- total property cost, own contribution entries (date, amount, note, e.g. down payment, registration, stamp duty), loan amount utilized (sum of disbursements).

**Disbursement:** date, amount, note. Supports staged disbursal (under-construction properties). Until fully disbursed, show pre-EMI interest on the disbursed amount.

**Rate change (floating loans):** effective date, new rate, choice of *keep EMI, change tenure* or *keep tenure, change EMI*.

**Payment:** date, amount, type (EMI, prepayment, part-payment, fee, other), principal part, interest part (auto-split from schedule, editable), status (scheduled, paid, missed), note.

**Prepayment option:** reduce tenure or reduce EMI.

**Note:** date, text, optional link to a payment. Notes can be standalone (e.g. "called bank about rate reset").

## 4. Features

### 4.1 Loan setup and inputs (requirement A)

- Create, edit, archive and delete loans via a form with inline validation.
- Inputs: loan amount, interest %, tenure, start date, total property cost, paid from own, loan utilized (disbursed), plus the fields in section 3.
- Auto-derived (read-only) values:
  - Own contribution %, loan share %, property cost remaining to pay.
  - Loan sanctioned but not yet disbursed.
  - Outstanding principal, principal repaid, interest paid to date.
  - EMI, total interest over the full term, total payable, interest as % of principal.
  - Next due date and amount, EMIs paid and remaining, projected closure date.
- Consistency checks with clear warnings: own + loan utilized should not exceed property cost, disbursed should not exceed sanctioned, payments should not exceed outstanding.

### 4.2 Visualizations (requirement B)

Per-loan dashboard, all charts with tooltips, legends and number formatting:

1. **Summary cards:** outstanding principal, EMI, next due, total interest, % repaid, projected closure date.
2. **Funding split donut:** own contribution vs loan used vs remaining property cost.
3. **Repayment progress bar:** principal repaid vs outstanding; second bar for disbursed vs sanctioned.
4. **Balance over time (line):** projected outstanding balance vs actual (from recorded payments).
5. **Principal vs interest per period (stacked bar):** yearly or monthly toggle.
6. **Cumulative interest paid (area).**
7. **Payment history chart:** actual paid vs scheduled per month, missed payments highlighted.
8. **Prepayment impact:** side-by-side comparison of interest saved and months saved with vs without prepayments.
9. **Amortization table:** monthly rows (date, opening balance, EMI, principal, interest, closing balance), paid rows marked, sortable, CSV export.

### 4.3 Multi-loan switching (requirement C)

- Sidebar or top selector listing all loans with status badge and outstanding amount. Selected loan persisted in the URL (`/loans/:id`).
- **All loans** overview: total outstanding, combined EMI per month, total interest, per-loan comparison chart, combined upcoming dues.
- Switching is instant (no full reload) and preserves the active tab.

### 4.4 Payments, notes and timeline (requirement D)

- Add, edit and delete payments and notes from the loan page.
- **Timeline view:** one chronological list merging payments, disbursements, own-contribution entries, rate changes and notes. Toggle ascending or descending (default newest first), filter by type, date range and text search.
- Future-dated entries appear in an **Upcoming** group; overdue scheduled payments are flagged.
- Group by month with subtotals of amount paid.
- Auto-generate scheduled EMI entries from the amortization schedule; user marks them paid and can adjust the actual date or amount.

### 4.5 Extra features (assumed)

- **What-if simulator:** enter a one-time or recurring prepayment, or a rate change, and see new closure date, interest saved and EMI. Not saved unless the user clicks Apply.
- **EMI calculator** standalone (amount, rate, tenure).
- In-app due reminders (banner for dues in the next 7 days, overdue count in the sidebar). No email or push.
- **Indian number formatting** (lakh/crore) and ₹ by default. Currency symbol configurable globally.
- Light and dark theme, responsive down to tablet width.
- Seed script with 2 demo loans for development.

## 5. Calculation rules

- Reducing-balance method. EMI = P·r·(1+r)^n / ((1+r)^n − 1), where r is the monthly rate (annual % / 12 / 100).
- Interest per period is computed on opening balance. Last EMI adjusts for rounding so the closing balance is exactly 0.
- Rounding: round interest to the nearest paisa per period. Document the rounding rule in the README.
- Prepayments are applied on payment date, reducing principal, then the schedule is recomputed per the chosen option (reduce tenure or reduce EMI).
- Floating rate: schedule is recomputed from each rate-change effective date.
- Staged disbursement: interest on disbursed amount only; EMI starts per lender rule, configurable as *pre-EMI (interest only)* until full disbursal or a set date.
- The calculation engine lives in `/packages/shared`, is pure TypeScript with no I/O, and is covered by unit tests with known-answer cases (e.g. ₹50,00,000 at 8.5% for 20 years, with the expected EMI verified against an independent calculator).

## 6. API (REST, JSON)

- `GET/POST /api/loans`, `GET/PUT/DELETE /api/loans/:id`
- `GET /api/loans/:id/summary` (derived metrics), `GET /api/loans/:id/schedule`
- `GET/POST /api/loans/:id/payments`, `PUT/DELETE /api/payments/:id`
- `GET/POST /api/loans/:id/disbursements`, `.../rate-changes`, `.../contributions`, `.../notes`
- `GET /api/loans/:id/timeline?type=&from=&to=&q=&order=`
- `POST /api/simulate` (what-if, stateless)
- `GET /api/export`, `POST /api/import`, `POST /api/backup`
- Consistent error format `{ error: { code, message, fields? } }`, Zod validation on every input, proper HTTP status codes.

## 7. Non-functional requirements

- Dashboard loads under 1 second with 5 loans and 600 payments each on a normal laptop.
- Strict TypeScript, ESLint + Prettier, no `any` in shared or API code.
- Accessibility: keyboard navigable, labelled form fields, chart colours distinguishable (not colour-only).
- README with setup, scripts, folder structure, backup/restore steps, and how to switch to Postgres.
- No telemetry, no external network calls at runtime.

## 8. Out of scope (v1)

Multi-user and authentication, bank/account aggregator integration, email or SMS notifications, mobile app, document or file attachments, tax calculations.

## 9. Execution plan

Build in 9 phases (P0 to P8), one task at a time, in the order below. Progress is tracked in the repo file `docs/BUILD_STATE.md`, so any session can stop and a new one can resume from the first unchecked task.

### 9.1 Agent operating rules

1. Start of every session: read `docs/SPEC.md`, then `docs/BUILD_STATE.md`, then run `git status`, `git log --oneline -15` and `npm run verify`. If `docs/BUILD_STATE.md` does not exist, start at P0-T1.
2. Work on the first unchecked task in `docs/BUILD_STATE.md`. Do not start a later task, and do not start a later phase until the current phase gate has passed.
3. A task is done only when its tests pass, `npm run verify` is green and the code is committed. Commit message format: `feat(P2-T4): loans CRUD endpoints`.
4. In the same commit, tick the task in `docs/BUILD_STATE.md` and append one line to the Session log (date, task id, what changed, anything left over).
5. Where the spec is silent or ambiguous, choose the simplest option consistent with the spec, record it in the Decisions log, and continue. Ask only if the choice would change the data model.
6. If a task is blocked, record the exact error under Blockers, mark it `[~]`, and move on only if the next task does not depend on it.
7. Never modify or delete files in `./data/`. Tests use a temporary database.
8. At the end of a phase: run the gate checks, tick the gate, tag the commit `phase-N-complete`.
9. Before ending a session, or when context is running low, leave the working tree clean: commit finished work, or commit as `wip(P3-T2): ...` and note in `docs/BUILD_STATE.md` exactly what remains.

### 9.2 `docs/BUILD_STATE.md` template

```markdown
# Build state
Current task: P0-T1 - Last updated: YYYY-MM-DD

## Tasks
- [ ] P0-T1 ...
(copy every task id from section 9.3, all unchecked)

## Phase gates
- [ ] P0 ...
(one line per phase gate)

## Decisions log
- YYYY-MM-DD - decision - reason

## Blockers
- none

## Session log
- YYYY-MM-DD - P0-T1 - what changed - what is left
```

### 9.3 Phases and tasks

**P0 Foundations**

- P0-T1 Git repo, npm workspaces monorepo (`apps/web`, `apps/api`, `packages/shared`), strict TypeScript configs, ESLint, Prettier, Vitest.
- P0-T2 Root scripts: `dev`, `build`, `test`, `lint`, `typecheck`, `verify` (typecheck + lint + test).
- P0-T3 Save this spec as `docs/SPEC.md`, create `docs/BUILD_STATE.md` from the template, README skeleton, `.gitignore` (including `data/`, `node_modules`, `.env`).
- Gate: `npm run verify` passes on the empty workspaces.

**P1 Calculation engine** (`packages/shared`, no UI, no DB)

- P1-T1 Money helpers (integer paise, rounding rule), date helpers (ISO dates, add months with day clamping), Indian number formatting.
- P1-T2 EMI formula and base amortization schedule, with known-answer tests.
- P1-T3 Apply recorded payments to the schedule: actual vs scheduled, outstanding balance as of any date.
- P1-T4 Prepayments in both modes (reduce tenure, reduce EMI).
- P1-T5 Floating rate changes in both modes.
- P1-T6 Staged disbursement and pre-EMI interest.
- P1-T7 Summary metrics from section 4.1 and the funding reconciliation checks with warnings.
- P1-T8 Pure what-if `simulate()` function.
- Gate: all engine tests pass; invariants hold over randomized inputs (closing balance is exactly 0, principal repaid sums to the amount disbursed, interest is never negative); engine coverage is at least 90%.

**P2 Database and API** (`apps/api`)

- P2-T1 Schema and migrations for every entity in section 3 (soft delete, timestamps), plus the demo seed script.
- P2-T2 Repository interfaces and SQLite implementation (WAL on, transactions for multi-row writes).
- P2-T3 Express skeleton: bind to 127.0.0.1, shared Zod validation, error format, health endpoint.
- P2-T4 Loans CRUD, `/summary` and `/schedule` endpoints.
- P2-T5 Payments, disbursements, rate changes, contributions and notes endpoints.
- P2-T6 Timeline endpoint (merge, filter, search, order).
- P2-T7 Simulate, export/import, backup (on start and daily, keep 30), trash and restore endpoints.
- Gate: integration tests (supertest, temporary DB) cover every endpoint including validation failures; a backup file is created on start.

**P3 Frontend shell and loan setup** (`apps/web`)

- P3-T1 Vite app, routing (`/loans/:id`), layout with loan switcher sidebar, theme toggle, API client, loading and error states.
- P3-T2 Loan create/edit form with validation, derived read-only values and warnings.
- P3-T3 Summary cards, funding split donut, repayment progress bars.
- Gate: create a loan in the UI, see the correct EMI and cards, switch between two loans with the URL in sync and no page reload.

**P4 Payments, notes and timeline**

- P4-T1 Forms for payments, disbursements, own contributions, rate changes and notes (add, edit, delete).
- P4-T2 Timeline view: chronological merge, filters, search, month grouping, Upcoming and overdue states.
- P4-T3 Scheduled EMI generation and the mark-as-paid flow.
- Gate: entries added in any order render chronologically; future and overdue items are visually distinct.

**P5 Charts and tables**

- P5-T1 Balance over time (projected vs actual).
- P5-T2 Principal vs interest per period (monthly/yearly toggle).
- P5-T3 Cumulative interest area chart.
- P5-T4 Payment history chart with missed payments highlighted.
- P5-T5 Amortization table with paid markers, sorting and CSV export.
- P5-T6 Prepayment impact comparison.
- Gate: every chart in section 4.2 is present with tooltips and legends, and updates when the loan is switched.

**P6 Multi-loan overview and planning tools**

- P6-T1 All-loans overview (totals, per-loan comparison chart, combined upcoming dues).
- P6-T2 What-if simulator UI with Apply, and the standalone EMI calculator.
- P6-T3 In-app due reminders (7-day banner, overdue count in the sidebar).
- Gate: overview totals equal the sum of the individual loans.

**P7 Data safety and polish**

- P7-T1 Export/import UI with validation preview, per-loan CSV export.
- P7-T2 Trash view with restore and permanent delete.
- P7-T3 Accessibility pass, dark mode check, tablet-width responsiveness.
- P7-T4 Performance check with a generated dataset of 5 loans and 600 payments each.
- Gate: export, wipe the DB, import, and the data is identical; the dashboard loads in under 1 second on the large dataset.

**P8 Hardening and handover**

- P8-T1 Complete the README (setup, scripts, folder structure, backup and restore, switching to Postgres).
- P8-T2 Optional Playwright smoke test of the main flow.
- P8-T3 Walk through every item in section 10, record the result in `docs/BUILD_STATE.md`, fix failures.
- Gate: all section 10 criteria pass. Tag `v1.0.0`.

### 9.4 Prompts for Copilot

First session (paste this, then the full spec below it):

```text
Build the personal loan dashboard described in the spec below, following section 9 exactly.

1. Check whether docs/BUILD_STATE.md exists in the repo. If it does, read it and resume at the first unchecked task. If it does not, start at P0-T1 and save this entire spec to docs/SPEC.md.
2. For every task follow the operating rules in section 9.1: one task at a time, verify, commit, update docs/BUILD_STATE.md.
3. Do not skip ahead. Do not mark a task done unless tests pass. Do not ask me questions unless a choice would change the data model; otherwise pick the simplest option and log it in the Decisions log.

Spec:
<paste the full spec here>
```

Any later session after a lost context:

```text
Read docs/SPEC.md and docs/BUILD_STATE.md, then continue from the first unchecked task following section 9.1.
```

## 10. Acceptance criteria

- Creating a loan with sanctioned amount, rate, tenure and start date yields a correct EMI and a full schedule that closes at exactly zero.
- Property cost, own contribution and loan utilized always reconcile, with warnings shown when they do not.
- Switching loans updates every chart and card without a page reload and keeps the URL in sync.
- Payments and notes added in any order always render chronologically; upcoming and overdue items are visually distinct.
- Restarting the app, or deleting the browser data, loses nothing; restoring from an export reproduces identical data.
- Engine unit tests pass, including prepayment (both modes), rate change and staged disbursement cases.
