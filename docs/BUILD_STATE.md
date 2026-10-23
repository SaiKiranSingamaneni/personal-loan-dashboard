# Build state
Current task: P3-T1 - Last updated: 2026-10-23

## Tasks
- [x] P0-T1 Git repo, npm workspaces monorepo (`apps/web`, `apps/api`, `packages/shared`), strict TypeScript configs, ESLint, Prettier, Vitest.
- [x] P0-T2 Root scripts: `dev`, `build`, `test`, `lint`, `typecheck`, `verify` (typecheck + lint + test).
- [x] P0-T3 Save this spec as `docs/SPEC.md`, create `docs/BUILD_STATE.md` from the template, README skeleton, `.gitignore` (including `data/`, `node_modules`, `.env`).
- [x] P1-T1 Money helpers (integer paise, rounding rule), date helpers (ISO dates, add months with day clamping), Indian number formatting.
- [x] P1-T2 EMI formula and base amortization schedule, with known-answer tests.
- [x] P1-T3 Apply recorded payments to the schedule: actual vs scheduled, outstanding balance as of any date.
- [x] P1-T4 Prepayments in both modes (reduce tenure, reduce EMI).
- [x] P1-T5 Floating rate changes in both modes.
- [x] P1-T6 Staged disbursement and pre-EMI interest.
- [x] P1-T7 Summary metrics from section 4.1 and the funding reconciliation checks with warnings.
- [x] P1-T8 Pure what-if `simulate()` function.
- [x] P2-T1 Schema and migrations for every entity in section 3 (soft delete, timestamps), plus the demo seed script.
- [x] P2-T2 Repository interfaces and SQLite implementation (WAL on, transactions for multi-row writes).
- [x] P2-T3 Express skeleton: bind to 127.0.0.1, shared Zod validation, error format, health endpoint.
- [x] P2-T4 Loans CRUD, `/summary` and `/schedule` endpoints.
- [x] P2-T5 Payments, disbursements, rate changes, contributions and notes endpoints.
- [x] P2-T6 Timeline endpoint (merge, filter, search, order).
- [x] P2-T7 Simulate, export/import, backup (on start and daily, keep 30), trash and restore endpoints.
- [ ] P3-T1 Vite app, routing (`/loans/:id`), layout with loan switcher sidebar, theme toggle, API client, loading and error states.
- [ ] P3-T2 Loan create/edit form with validation, derived read-only values and warnings.
- [ ] P3-T3 Summary cards, funding split donut, repayment progress bars.
- [ ] P4-T1 Forms for payments, disbursements, own contributions, rate changes and notes (add, edit, delete).
- [ ] P4-T2 Timeline view: chronological merge, filters, search, month grouping, Upcoming and overdue states.
- [ ] P4-T3 Scheduled EMI generation and the mark-as-paid flow.
- [ ] P5-T1 Balance over time (projected vs actual).
- [ ] P5-T2 Principal vs interest per period (monthly/yearly toggle).
- [ ] P5-T3 Cumulative interest area chart.
- [ ] P5-T4 Payment history chart with missed payments highlighted.
- [ ] P5-T5 Amortization table with paid markers, sorting and CSV export.
- [ ] P5-T6 Prepayment impact comparison.
- [ ] P6-T1 All-loans overview (totals, per-loan comparison chart, combined upcoming dues).
- [ ] P6-T2 What-if simulator UI with Apply, and the standalone EMI calculator.
- [ ] P6-T3 In-app due reminders (7-day banner, overdue count in the sidebar).
- [ ] P7-T1 Export/import UI with validation preview, per-loan CSV export.
- [ ] P7-T2 Trash view with restore and permanent delete.
- [ ] P7-T3 Accessibility pass, dark mode check, tablet-width responsiveness.
- [ ] P7-T4 Performance check with a generated dataset of 5 loans and 600 payments each.
- [ ] P8-T1 Complete the README (setup, scripts, folder structure, backup and restore, switching to Postgres).
- [ ] P8-T2 Optional Playwright smoke test of the main flow.
- [ ] P8-T3 Walk through every item in section 10, record the result in `docs/BUILD_STATE.md`, fix failures.

## Phase gates
- [x] P0 - `npm run verify` passes on the empty workspaces.
- [x] P1 - Engine tests pass; invariants hold; engine coverage is at least 90%.
- [x] P2 - Integration tests cover every endpoint and validation failure; startup backup exists.
- [ ] P3 - UI creates a loan, shows correct EMI/cards, and switches loans with URL sync and no reload.
- [ ] P4 - Timeline sorts entries and distinguishes future and overdue items.
- [ ] P5 - All charts have tooltips/legends and update on loan switch.
- [ ] P6 - Overview totals equal the sum of individual loans.
- [ ] P7 - Export/import round trip is identical; dashboard loads under 1 second on the large dataset.
- [ ] P8 - Section 10 acceptance criteria pass; tag `v1.0.0`.

## Decisions log
- 2026-10-23 - Use npm workspaces and a shared root TypeScript/ESLint/Prettier/Vitest toolchain - matches the specified npm monorepo and keeps setup local-first.
- 2026-10-23 - Round calculated interest to nearest paisa with half-paisa values rounded up; tenure begins at the first EMI after pre-EMI - makes schedule rounding and staged funding deterministic.
- 2026-10-23 - Apply a prepayment after any EMI due on the same date; rate changes affect the first installment due on or after their effective date - uses date-only schedule boundaries consistently.
- 2026-10-23 - Store the prepayment reduction choice on a prepayment or part-payment record - preserves how the loan schedule should be recalculated.
- 2026-10-23 - Store full exports as version 1 JSON and require an explicit `overwrite` mode after preview - prevents accidental replacement and supports future format migrations.

## Blockers
- none

## Session log
- 2026-10-23 - P0-T1 - Initialized the Git repository and npm workspaces, strict TypeScript configs, ESLint, Prettier, and Vitest; `npm run verify` passes - P0-T2 root scripts and P0-T3 README skeleton remained.
- 2026-10-23 - P0-T2 - Added root dev and build scripts alongside the verification scripts - P0-T3 README skeleton and P0 phase gate remain.
- 2026-10-23 - P0-T3 - Saved the complete spec and build tracker, added the README skeleton and data ignore rule; P0 gate checks pass - P1-T1 is next.
- 2026-10-23 - P1-T1 - Added exact rupee-to-paise parsing, nearest-paisa rounding, Indian formatting and ISO date helpers with month clamping - P1-T2 EMI schedule remains.
- 2026-10-23 - P1-T2 - Added EMI calculation and rounded reducing-balance schedule with a known-answer case and exact-zero closing balance - P1-T3 payment overlays remain.
- 2026-10-23 - P1-T3 - Added scheduled-versus-actual payment reconciliation and balance snapshots for any date - P1-T4 prepayment handling remains.
- 2026-10-23 - P1-T4 - Added prepayment schedule recalculation for reduce-tenure and reduce-EMI options - P1-T5 floating rate changes remain.
- 2026-10-23 - P1-T5 - Added floating rate reset recalculation for keep-EMI and keep-tenure modes - P1-T6 staged disbursement remains.
- 2026-10-23 - P1-T6 - Added staged funding projections with pre-EMI interest on disbursed funds and configurable EMI start - P1-T7 summary metrics remain.
- 2026-10-23 - P1-T7 - Added summary metrics and funding reconciliation warnings for property funding, sanction, and payment overages - P1-T8 what-if simulator remains.
- 2026-10-23 - P1-T8 - Added pure one-time/recurring prepayment and rate-change what-if projections - P1 randomized invariants and coverage gate remain.
- 2026-10-23 - P1 gate - Added 100 deterministic randomized schedule invariant cases and enforced 90% line/function/statement coverage; 28 tests pass and aggregate coverage is above threshold - P2-T1 is next.
- 2026-10-23 - P2-T1 - Added Drizzle table schemas, the initial SQLite migration for all loan entities, and a transactional two-loan seed script - P2-T2 repository and migration runner remain.
- 2026-10-23 - P2-T2 - Added versioned migration runner, SQLite WAL connection factory, typed repositories with soft delete/restore, and rollback tests - P2-T3 Express API skeleton remains.
- 2026-10-23 - P2-T3 - Added Express app/health route, loopback server binding, shared Zod loan schemas, validation helpers, and consistent errors; 37 tests pass - P2-T4 loans API remains.
- 2026-10-23 - P2-T4 - Added loan CRUD/archive endpoints plus derived summary and amortization schedule routes; 40 tests pass - P2-T5 payment and funding endpoints remain.
- 2026-10-23 - P2-T5 - Added validated CRUD routes for payments, disbursements, contributions, rate changes, and notes; 42 tests pass - P2-T6 timeline endpoint remains.
- 2026-10-23 - P2-T6 - Added merged timeline endpoint with type/date/text filtering, stable sort order, and upcoming/overdue flags; 45 tests pass - P2-T7 data safety endpoints remain.
- 2026-10-23 - P2-T7 - Added stateless simulation, validated export/import preview and overwrite, Trash restore/permanent-delete confirmation, and backup rotation; 49 tests pass - P2 integration coverage and startup-backup gate checks remain.
- 2026-10-23 - P2 gate - Expanded endpoint validation coverage to 51 tests and verified a startup backup is created in a temporary database directory - P3-T1 frontend shell is next.
