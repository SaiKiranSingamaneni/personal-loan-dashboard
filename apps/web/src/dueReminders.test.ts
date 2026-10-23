import { describe, expect, it } from "vitest";
import { addDaysIso, buildDueReminderSummary } from "./dueReminders.js";

describe("due reminders", () => {
  it("counts overdue unpaid rows and lists scheduled payments through the seventh day", () => {
    expect(addDaysIso("2026-10-29", 7)).toBe("2026-11-05");
    const result = buildDueReminderSummary([
      {
        id: "loan-1",
        name: "Home loan",
        schedule: [
          { dueDate: "2026-10-22", emi: 50000, status: "scheduled" },
          { dueDate: "2026-10-23", emi: 50000, status: "paid" },
          { dueDate: "2026-10-21", emi: 50000, status: "missed" },
          { dueDate: "2026-10-23", emi: 60000, status: "scheduled" },
          { dueDate: "2026-10-30", emi: 70000, status: "scheduled" },
          { dueDate: "2026-10-31", emi: 80000, status: "scheduled" },
        ],
      },
    ], "2026-10-23");

    expect(result.overdueCount).toBe(2);
    expect(result.upcoming.map((row) => [row.date, row.amount])).toEqual([
      ["2026-10-23", 60000],
      ["2026-10-30", 70000],
    ]);
  });
});
