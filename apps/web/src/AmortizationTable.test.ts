import { describe, expect, it } from "vitest";
import { amortizationCsv, sortScheduleRows, type AmortizationTableRow } from "./AmortizationTable.js";

const rows: AmortizationTableRow[] = [
  { period: 2, dueDate: "2026-03-05", openingBalance: 900000, emi: 100000, principal: 92000, interest: 8000, closingBalance: 808000, status: "scheduled" },
  { period: 1, dueDate: "2026-02-05", openingBalance: 1000000, emi: 100000, principal: 90000, interest: 10000, closingBalance: 910000, status: "paid" },
];

describe("amortization schedule table helpers", () => {
  it("sorts by selected columns in either direction without mutating source rows", () => {
    expect(sortScheduleRows(rows, "dueDate", "asc").map((row) => row.period)).toEqual([1, 2]);
    expect(sortScheduleRows(rows, "principal", "desc").map((row) => row.period)).toEqual([2, 1]);
    expect(rows[0]!.period).toBe(2);
  });

  it("exports a readable rupee schedule with status and CSV escaping", () => {
    const csv = amortizationCsv([{ ...rows[1]!, dueDate: "2026-02-05", status: "paid" }]);
    expect(csv.split("\r\n")[0]).toBe("Period,Due date,Opening balance (INR),EMI (INR),Principal (INR),Interest (INR),Closing balance (INR),Status");
    expect(csv.split("\r\n")[1]).toBe("1,2026-02-05,10000.00,1000.00,900.00,100.00,9100.00,paid");
  });
});
