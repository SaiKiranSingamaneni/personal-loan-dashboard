import { compareIsoDates, type IsoDate } from "./dates.js";
import type { AmortizationPeriod } from "./amortization.js";
import { asPaise, type Paise } from "./money.js";

export type PaymentStatus = "scheduled" | "paid" | "missed";

export interface RecordedPayment {
  date: IsoDate;
  amount: Paise;
  principalPart: Paise;
  interestPart: Paise;
  status: PaymentStatus;
  scheduledPeriod?: number;
}

export interface ReconciledPeriod extends AmortizationPeriod {
  actualAmount: Paise;
  actualPrincipal: Paise;
  actualInterest: Paise;
  actualStatus: PaymentStatus;
  actualOutstanding: Paise;
}

function validatePayments(payments: readonly RecordedPayment[]): void {
  for (const payment of payments) {
    if (payment.amount < 0 || payment.principalPart < 0 || payment.interestPart < 0) {
      throw new Error("Payment amounts and splits must not be negative");
    }
    if (
      payment.scheduledPeriod !== undefined &&
      (!Number.isInteger(payment.scheduledPeriod) || payment.scheduledPeriod < 1)
    ) {
      throw new Error("Scheduled period must be a positive integer");
    }
  }
}

/** Principal outstanding after all paid principal through the requested date. */
export function outstandingBalanceAsOf(
  originalPrincipal: Paise,
  payments: readonly RecordedPayment[],
  asOf: IsoDate,
): Paise {
  validatePayments(payments);
  const principalPaid = payments
    .filter(
      (payment) =>
        payment.status === "paid" && compareIsoDates(payment.date, asOf) <= 0,
    )
    .reduce((total, payment) => total + payment.principalPart, 0);
  if (principalPaid > originalPrincipal) {
    throw new Error("Recorded principal payments exceed the original principal");
  }
  return asPaise(originalPrincipal - principalPaid);
}

/** Add actual payment totals/status and actual balance snapshots to schedule rows. */
export function reconcileSchedule(
  schedule: readonly AmortizationPeriod[],
  payments: readonly RecordedPayment[],
): ReconciledPeriod[] {
  validatePayments(payments);
  const initialPrincipal = schedule[0]?.openingBalance;
  if (initialPrincipal === undefined) {
    return [];
  }
  const paidPayments = payments
    .filter((payment) => payment.status === "paid")
    .sort((left, right) => compareIsoDates(left.date, right.date));
  let paymentIndex = 0;
  let actualBalance = initialPrincipal;

  return schedule.map((period) => {
    const linked = payments.filter(
      (payment) => payment.scheduledPeriod === period.period,
    );
    const paidForPeriod = linked.filter((payment) => payment.status === "paid");
    const hasPaid = paidForPeriod.length > 0;
    const hasMissed = linked.some((payment) => payment.status === "missed");
    const actualAmount = paidForPeriod.reduce((sum, payment) => sum + payment.amount, 0);
    const actualPrincipal = paidForPeriod.reduce(
      (sum, payment) => sum + payment.principalPart,
      0,
    );
    const actualInterest = paidForPeriod.reduce(
      (sum, payment) => sum + payment.interestPart,
      0,
    );

    while (
      paymentIndex < paidPayments.length &&
      compareIsoDates(paidPayments[paymentIndex]!.date, period.dueDate) <= 0
    ) {
      const payment = paidPayments[paymentIndex]!;
      if (payment.principalPart > actualBalance) {
        throw new Error("Recorded principal payments exceed the outstanding balance");
      }
      actualBalance = asPaise(actualBalance - payment.principalPart);
      paymentIndex += 1;
    }

    return {
      ...period,
      actualAmount: asPaise(actualAmount),
      actualPrincipal: asPaise(actualPrincipal),
      actualInterest: asPaise(actualInterest),
      actualStatus: hasPaid ? "paid" : hasMissed ? "missed" : "scheduled",
      actualOutstanding: actualBalance,
    };
  });
}
