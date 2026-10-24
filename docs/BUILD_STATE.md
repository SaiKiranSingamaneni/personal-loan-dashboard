# Build state
Current task: Complete - Last updated: 2026-10-23

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
- [x] P3-T1 Vite app, routing (`/loans/:id`), layout with loan switcher sidebar, theme toggle, API client, loading and error states.
- [x] P3-T2 Loan create/edit form with validation, derived read-only values and warnings.
- [x] P3-T3 Summary cards, funding split donut, repayment progress bars.
- [x] P4-T1 Forms for payments, disbursements, own contributions, rate changes and notes (add, edit, delete).
- [x] P4-T2 Timeline view: chronological merge, filters, search, month grouping, Upcoming and overdue states.
- [x] P4-T3 Scheduled EMI generation and the mark-as-paid flow.
- [x] P5-T1 Balance over time (projected vs actual).
- [x] P5-T2 Principal vs interest per period (monthly/yearly toggle).
- [x] P5-T3 Cumulative interest area chart.
- [x] P5-T4 Payment history chart with missed payments highlighted.
- [x] P5-T5 Amortization table with paid markers, sorting and CSV export.
- [x] P5-T6 Prepayment impact comparison.
- [x] P6-T1 All-loans overview (totals, per-loan comparison chart, combined upcoming dues).
- [x] P6-T2 What-if simulator UI with Apply, and the standalone EMI calculator.
- [x] P6-T3 In-app due reminders (7-day banner, overdue count in the sidebar).
- [x] P7-T1 Export/import UI with validation preview, per-loan CSV export.
- [x] P7-T2 Trash view with restore and permanent delete.
- [x] P7-T3 Accessibility pass, dark mode check, tablet-width responsiveness.
- [x] P7-T4 Performance check with a generated dataset of 5 loans and 600 payments each.
- [x] P8-T1 Complete the README (setup, scripts, folder structure, backup and restore, switching to Postgres).
- [x] P8-T2 Optional Playwright smoke test of the main flow (covered by the existing React Testing Library smoke flow; Playwright omitted).
- [x] P8-T3 Walk through every item in section 10, record the result in `docs/BUILD_STATE.md`, fix failures.

## Phase gates
- [x] P0 - `npm run verify` passes on the empty workspaces.
- [x] P1 - Engine tests pass; invariants hold; engine coverage is at least 90%.
- [x] P2 - Integration tests cover every endpoint and validation failure; startup backup exists.
- [x] P3 - UI creates a loan, shows correct EMI/cards, and switches loans with URL sync and no reload.
- [x] P4 - Timeline sorts entries and distinguishes future and overdue items.
- [x] P5 - All charts have tooltips/legends and update on loan switch.
- [x] P6 - Overview totals equal the sum of individual loans.
- [x] P7 - Export/import round trip is identical; dashboard loads under 1 second on the large dataset.
- [x] P8 - Section 10 acceptance criteria pass; tag `v1.0.0`.

## Decisions log
- 2026-10-23 - Keep version-1 export imports backward compatible by defaulting new Activity/property arrays to empty while exporting the added records and invoice total on every current backup.
- 2026-10-23 - Derive historical automatic installments and dashboard financial totals in pure shared functions; preserve user edits and deleted auto-installment dates during recomputation.
- 2026-10-23 - Add unified activity and property cost tables additively; migrate financial records while retaining legacy source tables so prior exports and standalone notes remain preserved during the staged UI/API transition.
- 2026-10-23 - Use npm workspaces and a shared root TypeScript/ESLint/Prettier/Vitest toolchain - matches the specified npm monorepo and keeps setup local-first.
- 2026-10-23 - Round calculated interest to nearest paisa with half-paisa values rounded up; tenure begins at the first EMI after pre-EMI - makes schedule rounding and staged funding deterministic.
- 2026-10-23 - Apply a prepayment after any EMI due on the same date; rate changes affect the first installment due on or after their effective date - uses date-only schedule boundaries consistently.
- 2026-10-23 - Store the prepayment reduction choice on a prepayment or part-payment record - preserves how the loan schedule should be recalculated.
- 2026-10-23 - Store full exports as version 1 JSON and require an explicit `overwrite` mode after preview - prevents accidental replacement and supports future format migrations.
- 2026-10-23 - Use a jsdom React Testing Library flow to exercise loan creation and URL-preserving tab/loan switching - verifies the P3 user-visible gate without requiring a browser install.
- 2026-10-23 - Use a shared Activity entry manager with conditional forms and API-backed CRUD for each entry type - keeps the timeline source records directly editable and validates input through shared Zod schemas.
- 2026-10-23 - Keep the timeline query parameters in server requests and group its results in the UI by month with a distinct Upcoming section - lets the server own filtering/order while preserving visible month totals and due states.
- 2026-10-23 - Generate scheduled EMI rows through an idempotent API operation and refresh only unpaid scheduled rows - avoids duplicate installments and preserves actual paid records when the schedule is revisited.
- 2026-10-23 - Calculate actual balance from dated disbursements less principal parts of paid payments and stop the actual series at today - keeps the projection from being mistaken for recorded future activity.
- 2026-10-23 - Aggregate projected principal and interest into calendar month or year buckets for the stacked chart - makes period comparisons match due dates and leaves the schedule as the single source of totals.
- 2026-10-23 - Build cumulative interest only from paid payment records, carrying the running total through months without a payment - keeps scheduled or missed interest out of the actual-paid chart.
- 2026-10-23 - Show paid, scheduled, and missed payment amounts as separate monthly bar series - makes missed installments visually distinct while retaining the scheduled-versus-actual comparison.
- 2026-10-23 - Export amortization amounts in readable INR decimal units while keeping stored values in paise - makes the CSV useful without changing exact stored money.
- 2026-10-23 - Base the prepayment comparison on paid prepayment/part-payment rows and their recorded reduction mode - compares the current amortization schedule with the actual principal reductions entered by the user.
- 2026-10-23 - Use the loan summary's next unpaid installment for combined upcoming dues and count all non-deleted loans in overview totals - keeps the overview consistent with the per-loan summary values.
- 2026-10-23 - Persist an applied what-if as payment or rate-change records inside one repository transaction - ensures recurring plans are all-or-nothing and all applied scenarios remain editable in the loan history.
- 2026-10-23 - Derive 7-day reminders and overdue counts from each loan's schedule - makes reminders available on every route even before Activity has generated payment records.
- 2026-10-23 - Define the versioned JSON export schema in the shared package for both browser preflight and API validation - ensures import preview uses the same record rules as the server.
- 2026-10-23 - Sort Trash newest-deleted first and require both browser confirmation and the API's `DELETE` token before hard deletion - keeps recovery actions visible and permanent removal deliberate.
- 2026-10-23 - Ignore only the regenerated `exportedAt` metadata when asserting a full import/export round trip - exports intentionally record the time of each export, while all persisted loan data must match.
- 2026-10-23 - Omit the optional Playwright runner because it is not installed and no browser binary is available; retain the existing React Testing Library end-to-end smoke flow - avoids adding a separate browser runtime for the same main flow.

## Blockers
- none

## Loan screen rewrite tasks
- [x] R-T1 Data model, migration and repository changes.
- [x] R-T2 Engine: split logic, auto EMI generation, dashboard summary, warnings, with tests.
- [x] R-T3 API endpoints and integration tests.
- [x] R-T4 Property cost editor in Loan details.
- [x] R-T5 Dashboard: banner, KPI cards, both pies, progress bars, glossary and tooltips.
- [x] R-T6 Activity form with type-specific fields and the edit mode.
- [x] R-T7 Activity table: filters, sort, scrolling, pagination, totals strip, delete and trash.
- [x] R-T8 Move existing charts to the Analysis tab, remove the old Timeline and per-entity forms, update the README.

### Rewrite phase gate
- [x] `npm run verify` passes; tag `rewrite-complete` after R-T1 through R-T8 are committed.

## Property cost rework tasks
Current task: S-T1 - Last updated: 2026-10-24

- [ ] S-T1 Data model changes and migration (three groups, PropertyDetails, noted totals).
- [ ] S-T2 Engine: tiers, funding split, cross-checks, dashboard summary, tests with the fixture.
- [ ] S-T3 API: property endpoint and dashboard payload, integration tests.
- [ ] S-T4 Loan form and property form with hints, Indian number input, live cross-check panel.
- [ ] S-T5 Property cost breakdown popup and the (i) icon.
- [ ] S-T6 KPI cards, the two new pies, summary banner update, empty states.
- [ ] S-T7 Glossary and tooltips, remove the old two-group editor and the old property pie toggle, update README.

### Property cost rework gate
- [ ] `npm run verify` passes; tag `property-rework-complete` after S-T1 through S-T7 are committed.

## Session log
- 2026-10-24 - Startup migration fix - Restrict legacy AUTO EMI promotion to scheduled-period records and skip dates already owned by an AUTO row; same-date collision regression test and full `npm run verify` pass (100 tests).
- 2026-10-23 - R-T8 follow-up - Removed legacy aggregate funding edits from existing-loan details so Activity remains the funding source of truth; final `npm run verify` passes (100 tests) and the web build succeeds.
- 2026-10-23 - Rewrite phase gate - `npm run verify` passes on the committed R-T1 through R-T8 tree (100 tests); created the `rewrite-complete` tag.
- 2026-10-23 - R-T8 - Reorganized loans into Dashboard, Activity, Analysis, and Loan details; moved charts/amortization to Analysis, removed old Activity/Timeline UI, preserved legacy tab URLs, and updated README; `npm run verify` passes (100 tests) and the web build succeeds - final verify and `rewrite-complete` tag remain.
- 2026-10-23 - R-T7 - Replaced legacy entry list/timeline on Activity with a unified filterable, sortable, paginated table, current-filter totals, sticky date/header, notes expansion, computed splits, edit/delete, and Trash restore; `npm run verify` passes (105 tests) and the web build succeeds - R-T8 is next.
- 2026-10-23 - R-T6 - Added type-specific unified Activity entry creation and editing, locked edit type, inline date/title/amount/rate validation, success toast, cancel, and scroll-to-edit behavior; `npm run verify` passes (103 tests) and the web build succeeds - R-T7 is next.
- 2026-10-23 - R-T5 - Added plain-language loan summary, six compact-money KPIs, item/payer and loan pies, stacked funding/progress bars, definitions drawer, technical-term tooltips, and recent activity; `npm run verify` passes (101 tests) and the web build succeeds - R-T6 is next.
- 2026-10-23 - R-T4 - Added grouped agreement/extra-cost editing with suggested/custom names, paise-safe amounts, subtotals, invoice mismatch warning, and stable component IDs; `npm run verify` passes (100 tests) and the web build succeeds - R-T5 is next.
- 2026-10-23 - R-T3 - Added Activity, property, dashboard, auto-EMI restore, Trash and data-transfer API support; generated past EMIs run at startup, daily, and on input changes; `npm run verify` passes (98 tests) - R-T4 is next.
- 2026-10-23 - R-T2 - Added effective-dated rate-aware interest splits, idempotent automatic EMI reconciliation, next-EMI and dashboard summary calculation, and funding warnings; `npm run verify` passes (96 tests) - R-T3 is next.
- 2026-10-23 - R-T1 - Added typed property-cost and unified activity persistence, validated input schemas, migration 0005, legacy financial-record conversion, and repository coverage; focused database tests, workspace typecheck, and targeted lint pass - R-T2 engine is next.
- 2026-10-23 - Post-v1 EMI basis and loan delete - Added selectable sanctioned/disbursed EMI basis, optional pre-EMI interest-only behavior, daily/monthly pure payment split with carry-forward warnings, payment breakdown API/UI, and sidebar loan-to-Trash action; `npm run verify` passes (90 tests) - no outstanding work.
- 2026-10-23 - Post-v1 EMI and Activity update - Added a persisted EMI calculation basis (sanctioned or disbursed principal), migration for existing databases, completed EMI timeline filter, and verified due EMIs are automatically marked paid; `npm run verify` passes (85 tests) - no outstanding work.
- 2026-10-23 - Post-v1 Activity refinements - Added sortable, filterable and paginated recorded entries, paginated upcoming EMIs, note-first entry details, automatic paid status for EMIs due through today, and fixed migration path resolution for dev startup; `npm run verify` passes - no outstanding work.
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
- 2026-10-23 - P3-T1 - Added React/Vite shell, URL-synced loan selector, preserved tab query, theme toggle, local API client, and loading/error states; `npm run build` passes - P3-T2 loan form remains.
- 2026-10-23 - P3-T2 - Added validated loan create/edit form, paise-safe EMI/funding previews and atomic initial funding saves; 54 tests pass and web build succeeds - P3-T3 summary cards and funding split remain.
- 2026-10-23 - P3-T3 - Added six loan summary cards, Recharts funding donut, and repayment/disbursement progress bars with warnings; verification passes and web build succeeds - P4-T1 entry forms remain.
- 2026-10-23 - P3 gate - Added a jsdom UI flow covering two loan creations, the known ₹43,391.16 EMI, summary cards, URL/tab preservation, and client-side loan switching; `npm run verify` passes (55 tests) and `npm run build` succeeds - P4-T1 is next.
- 2026-10-23 - P4-T1 - Added validated Activity forms for payments, disbursements, contributions, rate changes, and linked/standalone notes, with edit and soft-delete actions; 57 tests pass and production build succeeds - P4-T2 timeline filters and grouping remain.
- 2026-10-23 - P4-T2 - Added merged timeline filters, newest/oldest ordering, monthly paid subtotals, a future Upcoming group, and explicit overdue styling; 58 tests pass and production build succeeds - P4-T3 scheduled EMI generation and mark-as-paid remain.
- 2026-10-23 - P4-T3 - Added transactional scheduled EMI generation from the current schedule, refresh of unpaid installments, and editable mark-as-paid flow; 60 tests pass and production build succeeds - P4 chronology/upcoming/overdue gate passes; P5-T1 charts remain.
- 2026-10-23 - P4 gate - Verified API chronological ordering and UI separation of future and overdue items; full verification passes (60 tests) and production build succeeds - P5-T1 is next.
- 2026-10-23 - P5-T1 - Added a projected versus actual outstanding balance line chart, including staged funding and actual paid principal; 62 tests pass and production build succeeds - P5-T2 principal-versus-interest periods remain.
- 2026-10-23 - P5-T2 - Added stacked principal/interest bars with monthly/yearly aggregation and a period toggle; 64 tests pass and production build succeeds - P5-T3 cumulative interest chart remains.
- 2026-10-23 - P5-T3 - Added an actual cumulative interest area chart with monthly totals, flat months, tooltips, and a no-paid-interest state; 66 tests pass and production build succeeds - P5-T4 payment history chart remains.
- 2026-10-23 - P5-T4 - Added monthly actual, scheduled, and missed payment bars with missed payments in a distinct warning color; 68 tests pass and production build succeeds - P5-T5 amortization table remains.
- 2026-10-23 - P5-T5 - Added the Schedule tab amortization table with period/date/amount sorting, paid and missed markers, and INR CSV export; 70 tests pass and production build succeeds - P5-T6 prepayment impact comparison remains.
- 2026-10-23 - P5-T6 - Added side-by-side base and prepayment projections for total interest, term, closure date, interest saved, and months saved for both reduction modes; 72 tests pass and production build succeeds - P5 chart/table gate passes; P6-T1 all-loans overview is next.
- 2026-10-23 - P5 gate - Confirmed all specified loan charts are mounted in the loan overview with tooltips/legends, loan-scoped query keys, and the amortization table has sorting/export; full verification passes (72 tests) and production build succeeds - P6-T1 is next.
- 2026-10-23 - P6-T1 - Added the All loans route/sidebar link, combined outstanding/EMI/interest totals, outstanding comparison chart, and next due list sorted by date; 73 tests pass and production build succeeds - P6-T2 what-if simulator and EMI calculator remain.
- 2026-10-23 - P6-T2 - Added one-time/recurring prepayment and rate-change simulation with explicit Apply plus a standalone EMI calculator; applied plans save as loan entries transactionally; 76 tests pass and production build succeeds - P6-T3 due reminders remain.
- 2026-10-23 - P6-T3 - Added the next-seven-days due banner and sidebar overdue count using schedule status and local date boundaries; 77 tests pass and production build succeeds - P6 totals gate passes; P7-T1 data export/import UI is next.
- 2026-10-23 - P6 gate - Verified overview totals against individual loan summaries and completed planning tools and due reminders; full verification passes (77 tests) and production build succeeds - P7-T1 is next.
- 2026-10-23 - P7-T1 - Added Data and backups page for JSON export, shared-schema validation preview, confirmed overwrite, manual backup, and payment CSV export; amortization CSV is available in Schedule; 79 tests pass and production build succeeds - P7-T2 Trash view remains.
- 2026-10-23 - P7-T2 - Added a Trash page listing deleted loans and entries with restore and confirmed permanent-delete actions; 80 tests pass and production build succeeds - P7-T3 accessibility/theme/tablet review remains.
- 2026-10-23 - P7-T3 - Added visible keyboard focus, readable loan status badges, improved muted text contrast, retained the theme toggle on narrow screens, and tested light/dark persistence; `npm run verify` passes (80 tests) and production build succeeds - P7-T4 performance check remains.
- 2026-10-23 - P7-T4 - Exercised dashboard bootstrap endpoints using five loans with 600 payment records each and confirmed the full export/import data round trip; generated dataset requests completed under one second and `npm run verify` passes (81 tests) - P7 gate passes; P8-T1 README handover remains.
- 2026-10-23 - P8-T1 - Completed setup, command, workspace, exact rounding, backup/restore, JSON transfer, and future Postgres adapter documentation; `npm run verify` passes (81 tests) - P8-T2 optional Playwright smoke test remains.
- 2026-10-23 - P8-T2 - Used the existing React Testing Library main-flow smoke test; Playwright was omitted because the package and browser are unavailable and the task is optional - P8-T3 section 10 acceptance walkthrough remains.
- 2026-10-23 - P8-T3 - Walked all six section 10 acceptance criteria, added a file-backed SQLite close/reopen persistence test and a five-loan dashboard render benchmark (167 ms isolated; 420 ms in the full suite); `npm run verify` passes (83 tests) and production build succeeds - all acceptance checks pass; v1.0.0 handover tag remains.

## Section 10 acceptance walkthrough

- [x] Correct EMI and schedule closing at zero - known-answer EMI and exact-zero schedule cases pass in `packages/shared/src/amortization.test.ts`; the UI smoke flow verifies the ₹43,391.16 EMI.
- [x] Property funding reconciliation and warnings - funding percentages/remaining amounts and overage warnings pass in `packages/shared/src/summary.test.ts`; the loan form and dashboard display the warning values.
- [x] Loan switching updates the dashboard and URL without a reload - `apps/web/src/App.smoke.test.tsx` switches between two loans, preserves the Activity tab in the URL, and confirms no `beforeunload`; chart queries include the selected loan ID.
- [x] Chronological timeline and distinct future/overdue states - `apps/api/src/routes/timeline.test.ts` covers merged ordering and due flags; `apps/web/src/LoanTimeline.test.tsx` covers grouping and filtering.
- [x] Restart and export/import preserve data - `apps/api/src/db/persistence.test.ts` closes and reopens a file-backed SQLite database; startup backups pass in `apps/api/src/db/backup.test.ts`; `apps/api/src/routes/dataSafety.test.ts` compares the full exported dataset after overwrite (excluding only its refreshed export timestamp).
- [x] Engine cases for prepayments, rate changes, and staged disbursement - `packages/shared/src/prepayments.test.ts`, `packages/shared/src/rateChanges.test.ts`, and `packages/shared/src/disbursements.test.ts` pass with the rest of the suite.
- [x] Large dataset performance - `apps/api/src/performance.test.ts` checks the five-loan API bootstrap with 600 payments each; `apps/web/src/Performance.smoke.test.tsx` renders the overview and chart set below the one-second threshold.
- [x] Optional Playwright flow - omitted because Playwright and a browser binary are not installed; the React Testing Library main-flow smoke test passes.
