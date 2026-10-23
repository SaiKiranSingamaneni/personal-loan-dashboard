import { useEffect, useMemo, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import {
  Link,
  NavLink,
  Outlet,
  useLocation,
  useSearchParams,
} from "react-router-dom";
import { asPaise, formatIndianMoney } from "@loan-dashboard/shared";
import { apiRequest, ApiClientError } from "./api.js";
import { LoanFormPage } from "./LoanForm.js";
import { LoanSummaryDashboard, type LoanSummaryData } from "./LoanSummaryDashboard.js";
import { LoanEntries } from "./LoanEntries.js";
import { LoanTimeline } from "./LoanTimeline.js";
import { BalanceOverTimeChart } from "./BalanceOverTimeChart.js";
import { PrincipalInterestChart } from "./PrincipalInterestChart.js";
import { CumulativeInterestChart } from "./CumulativeInterestChart.js";
import { PaymentHistoryChart } from "./PaymentHistoryChart.js";
import { AmortizationTable } from "./AmortizationTable.js";
import { PrepaymentImpact } from "./PrepaymentImpact.js";
import { AllLoansOverview } from "./AllLoansOverview.js";
import { WhatIfSimulator } from "./WhatIfSimulator.js";
import { EmiCalculatorPage } from "./EmiCalculator.js";
import { buildDueReminderSummary, localIsoToday } from "./dueReminders.js";
import { DataManagementPage } from "./DataManagement.js";
import { TrashPage } from "./TrashPage.js";

interface LoanListItem {
  id: string;
  name: string;
  lender: string;
  loanType: string;
  status: "active" | "closed";
  archivedAt: string | null;
}

interface LoanSummaryResponse {
  summary: {
    outstandingPrincipal: number;
  };
}

interface ReminderScheduleRow {
  dueDate: string;
  emi: number;
  status: "scheduled" | "paid" | "missed";
}

interface LoanListError {
  error: {
    message: string;
  };
}

const loanQueryKey = ["loans"] as const;

function displayMoney(value: number | undefined): string {
  return value === undefined ? "Balance loading" : formatIndianMoney(asPaise(value));
}

function ApiError({ error }: { error: Error }) {
  const message =
    error instanceof ApiClientError
      ? error.message
      : (error as Error & LoanListError).error?.message ?? error.message;
  return (
    <div className="notice notice-error" role="alert">
      <strong>Couldn’t load loan data</strong>
      <span>{message}</span>
      <button className="button button-secondary" onClick={() => window.location.reload()}>
        Retry
      </button>
    </div>
  );
}

function EmptyLoans() {
  return (
    <section className="empty-state">
      <div className="empty-icon" aria-hidden="true">₹</div>
      <h1>Start with a loan</h1>
      <p>Your loans, payment history, and plans will stay on this device.</p>
      <Link className="button button-primary" to="/loans/new">
        Add your first loan
      </Link>
    </section>
  );
}

function AppShell() {
  const location = useLocation();
  const [dark, setDark] = useState(() => localStorage.getItem("loan-theme") === "dark");
  const loansQuery = useQuery({
    queryKey: loanQueryKey,
    queryFn: () => apiRequest<LoanListItem[]>("/api/loans"),
  });
  const loans = loansQuery.data ?? [];
  const summaries = useQueries({
    queries: loans.map((loan) => ({
      queryKey: ["loans", loan.id, "summary"],
      queryFn: () => apiRequest<LoanSummaryResponse>(`/api/loans/${loan.id}/summary`),
      enabled: loans.length > 0,
      staleTime: 30_000,
    })),
  });
  const reminderSchedules = useQueries({
    queries: loans.map((loan) => ({
      queryKey: ["loans", loan.id, "schedule", "reminders"],
      queryFn: () => apiRequest<ReminderScheduleRow[]>(`/api/loans/${loan.id}/schedule`),
      enabled: loans.length > 0,
      staleTime: 30_000,
    })),
  });
  const reminderSummary = buildDueReminderSummary(loans.map((loan, index) => ({
    id: loan.id,
    name: loan.name,
    schedule: reminderSchedules[index]?.data ?? [],
  })), localIsoToday());
  const selectedId = useMemo(() => {
    const parts = location.pathname.split("/");
    return parts[1] === "loans" ? parts[2] : undefined;
  }, [location.pathname]);
  const isFormRoute = /^\/loans\/(new|[^/]+\/edit)$/.test(location.pathname);

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    localStorage.setItem("loan-theme", dark ? "dark" : "light");
  }, [dark]);

  if (loansQuery.isPending) {
    return (
      <main className="center-state" aria-live="polite">
        <div className="loader" aria-hidden="true" />
        <p>Loading your loans…</p>
      </main>
    );
  }
  if (loansQuery.error !== null) {
    return <main className="center-state"><ApiError error={loansQuery.error} /></main>;
  }
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" to="/" aria-label="Personal Loan Dashboard home">
          <span className="brand-mark" aria-hidden="true">₹</span>
          <span>Ledgerline<span className="brand-subtitle">PERSONAL FINANCE</span></span>
        </Link>

        <div className="sidebar-heading">
          <span>Your loans</span>
          <span className="loan-count">{loans.length}</span>
        </div>
        {reminderSummary.overdueCount > 0 && <div className="overdue-sidebar-count" aria-label={`${reminderSummary.overdueCount} overdue payments`}><span>{reminderSummary.overdueCount}</span> overdue</div>}
        <NavLink to="/" end className={({ isActive }) => `all-loans-link${isActive ? " is-active" : ""}`}>
          <span className="all-loans-icon" aria-hidden="true">▦</span><span>All loans</span>
        </NavLink>
        <nav className="loan-list" aria-label="Loan selector">
          {loans.map((loan, index) => {
            const balance = summaries[index]?.data?.summary.outstandingPrincipal;
            return (
              <NavLink
                key={loan.id}
                to={`/loans/${loan.id}${location.search}`}
                className={({ isActive }) => `loan-link${isActive ? " is-active" : ""}`}
              >
                <span className={`loan-avatar avatar-${index % 4}`} aria-hidden="true">
                  {loan.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="loan-link-copy">
                  <span className="loan-link-name">{loan.name}</span>
                  <span className="loan-link-meta">{displayMoney(balance)}</span>
                </span>
                <span className={`loan-status-badge loan-status-${loan.status}`}>{loan.status}</span>
              </NavLink>
            );
          })}
        </nav>
        <Link className="add-loan-link" to="/loans/new"><span aria-hidden="true">+</span> Add loan</Link>
        <NavLink to="/calculator" className={({ isActive }) => `calculator-link${isActive ? " is-active" : ""}`}>EMI calculator</NavLink>
        <NavLink to="/data" className={({ isActive }) => `calculator-link${isActive ? " is-active" : ""}`}>Data and backups</NavLink>
        <NavLink to="/trash" className={({ isActive }) => `calculator-link${isActive ? " is-active" : ""}`}>Trash</NavLink>
        {loans.length === 0 && (
          <p className="sidebar-empty">Your loan list will appear here.</p>
        )}

        <div className="sidebar-bottom">
          <div className="privacy-card">
            <span className="privacy-icon" aria-hidden="true">⌂</span>
            <div><strong>Private by default</strong><span>Data stays on this device</span></div>
          </div>
          <button
            className="theme-button"
            onClick={() => setDark((value) => !value)}
            aria-label={`Switch to ${dark ? "light" : "dark"} theme`}
          >
            <span aria-hidden="true">{dark ? "☼" : "◐"}</span>
            {dark ? "Light appearance" : "Dark appearance"}
          </button>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb"><span>Loans</span><span aria-hidden="true">/</span><strong>{loans.find((loan) => loan.id === selectedId)?.name ?? "Overview"}</strong></div>
          <div className="topbar-right"><span className="local-badge"><span /> Local only</span></div>
        </header>
        {reminderSummary.upcoming.length > 0 && <section className="due-reminder-banner" role="status" aria-label="Dues in the next seven days">
          <div className="due-reminder-heading"><span className="due-reminder-icon" aria-hidden="true">◷</span><div><strong>Due in the next 7 days</strong><span>{reminderSummary.upcoming.length} upcoming {reminderSummary.upcoming.length === 1 ? "payment" : "payments"}</span></div></div>
          <ul>{reminderSummary.upcoming.map((item) => <li key={`${item.loanId}-${item.date}`}><Link to={`/loans/${item.loanId}?tab=activity`}><span>{item.loanName} · {item.date}</span><strong>{formatIndianMoney(asPaise(item.amount))}</strong></Link></li>)}</ul>
        </section>}
        <div className="content-area">
          {loans.length === 0 && !isFormRoute && location.pathname !== "/calculator" && location.pathname !== "/data" && location.pathname !== "/trash" ? (
            <EmptyLoans />
          ) : (
            <Outlet context={{ loans }} />
          )}
        </div>
      </main>
    </div>
  );
}

function LoanPage() {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const loanId = location.pathname.split("/")[2];
  const tab = searchParams.get("tab") ?? "overview";
  const loanQuery = useQuery({
    queryKey: ["loans", loanId],
    queryFn: () => apiRequest<LoanListItem>(`/api/loans/${loanId}`),
    enabled: loanId !== undefined,
  });
  const summaryQuery = useQuery({
    queryKey: ["loans", loanId, "summary"],
    queryFn: () => apiRequest<{ summary: LoanSummaryData }>(`/api/loans/${loanId}/summary`),
    enabled: loanId !== undefined && tab === "overview",
  });

  if (loanQuery.isPending) {
    return <div className="panel-skeleton" aria-label="Loading loan details" />;
  }
  if (loanQuery.error !== null) {
    return <ApiError error={loanQuery.error} />;
  }
  const loan = loanQuery.data;

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">{loan.lender} · {loan.loanType} loan</div>
          <h1>{loan.name}</h1>
          <p>Track your balance, payments, and funding in one place.</p>
        </div>
        <div className="heading-actions">
          <Link className="button button-secondary" to={`/loans/${loan.id}/edit${location.search}`}>Edit loan</Link>
          <span className={`status-pill status-pill-${loan.status}`}>{loan.status}</span>
        </div>
      </div>
      <div className="tabs" role="tablist" aria-label="Loan sections">
        {[
          ["overview", "Overview"],
          ["activity", "Activity"],
          ["schedule", "Schedule"],
        ].map(([value, label]) => (
          <button
            key={value}
            role="tab"
            aria-selected={tab === value}
            className={`tab${tab === value ? " is-selected" : ""}`}
            onClick={() => setSearchParams({ tab: value! })}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "overview" ? (
        summaryQuery.isPending ? (
          <div className="panel-skeleton" aria-label="Loading loan summary" />
        ) : summaryQuery.error ? (
          <ApiError error={summaryQuery.error} />
        ) : summaryQuery.data ? (
          <>
            <LoanSummaryDashboard summary={summaryQuery.data.summary} />
            <BalanceOverTimeChart loanId={loan.id} />
            <PrincipalInterestChart loanId={loan.id} />
            <CumulativeInterestChart loanId={loan.id} />
            <PaymentHistoryChart loanId={loan.id} />
            <PrepaymentImpact loanId={loan.id} />
            <WhatIfSimulator loanId={loan.id} />
          </>
        ) : null
      ) : tab === "activity" ? (
        <>
          <LoanTimeline loanId={loan.id} />
          <LoanEntries loanId={loan.id} />
        </>
      ) : tab === "schedule" ? (
        <AmortizationTable loanId={loan.id} />
      ) : <section className="placeholder-panel" role="tabpanel">
        <div className="panel-kicker">{tab}</div>
        <h2>{tab === "overview" ? "Your loan at a glance" : tab === "activity" ? "Recent loan activity" : "Repayment schedule"}</h2>
        <p>The dashboard is connected to your local loan data. The next build step adds loan setup and live summary values here.</p>
        <div className="placeholder-metrics">
          <div><span>Loan status</span><strong>{loan.status}</strong></div>
          <div><span>Lender</span><strong>{loan.lender}</strong></div>
          <div><span>Loan type</span><strong>{loan.loanType}</strong></div>
        </div>
      </section>}
    </>
  );
}

export function App() {
  return (
    <AppShell />
  );
}

export function LoanRoute() {
  return <LoanPage />;
}

export { AllLoansOverview, DataManagementPage, EmiCalculatorPage, LoanFormPage, TrashPage };

