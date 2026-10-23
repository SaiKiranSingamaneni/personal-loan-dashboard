export interface ReminderLoan {
  id: string;
  name: string;
  schedule: readonly { dueDate: string; emi: number; status: "scheduled" | "paid" | "missed" }[];
}

export interface UpcomingReminder {
  loanId: string;
  loanName: string;
  date: string;
  amount: number;
}

export interface DueReminderSummary {
  overdueCount: number;
  upcoming: UpcomingReminder[];
}

export function localIsoToday(now = new Date()): string {
  return `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, "0")}-${now.getDate().toString().padStart(2, "0")}`;
}

export function addDaysIso(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(Date.UTC(year!, month! - 1, day! + days));
  return `${next.getUTCFullYear()}-${(next.getUTCMonth() + 1).toString().padStart(2, "0")}-${next.getUTCDate().toString().padStart(2, "0")}`;
}

export function buildDueReminderSummary(loans: readonly ReminderLoan[], today: string): DueReminderSummary {
  const through = addDaysIso(today, 7);
  let overdueCount = 0;
  const upcoming: UpcomingReminder[] = [];
  for (const loan of loans) {
    for (const row of loan.schedule) {
      if (row.dueDate < today && row.status !== "paid") overdueCount += 1;
      if (row.status === "scheduled" && row.dueDate >= today && row.dueDate <= through) {
        upcoming.push({ loanId: loan.id, loanName: loan.name, date: row.dueDate, amount: row.emi });
      }
    }
  }
  upcoming.sort((left, right) => left.date.localeCompare(right.date) || left.loanName.localeCompare(right.loanName));
  return { overdueCount, upcoming };
}
