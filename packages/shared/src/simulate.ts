import { addMonths, compareIsoDates, type IsoDate } from "./dates.js";
import type { AmortizationPeriod } from "./amortization.js";
import { applyPrepayment, type PrepaymentMode } from "./prepayments.js";
import { applyRateChanges, type RateChange } from "./rateChanges.js";
import type { Paise } from "./money.js";

export type SimulationScenario =
  | {
      type: "prepayment";
      amount: Paise;
      date: IsoDate;
      mode: PrepaymentMode;
    }
  | {
      type: "recurring-prepayment";
      amount: Paise;
      firstDate: IsoDate;
      intervalMonths: number;
      count: number;
      mode: PrepaymentMode;
    }
  | { type: "rate-change"; changes: readonly RateChange[] };

export interface SimulationInput {
  schedule: readonly AmortizationPeriod[];
  annualRatePercent: number;
  scenario: SimulationScenario;
}

export interface SimulationResult {
  schedule: AmortizationPeriod[];
  baseInterest: Paise;
  projectedInterest: Paise;
  interestSaved: Paise;
  monthsSaved: number;
  baseClosureDate: IsoDate | null;
  projectedClosureDate: IsoDate | null;
  baseEmi: Paise;
  projectedEmi: Paise;
}

function interestTotal(schedule: readonly AmortizationPeriod[]): Paise {
  return schedule.reduce((sum, row) => sum + row.interest, 0) as Paise;
}

function firstEmi(
  schedule: readonly AmortizationPeriod[],
  afterDate?: IsoDate,
  inclusive = true,
): Paise {
  const row = schedule.find(
    (period) =>
      period.principal > 0 &&
      (afterDate === undefined ||
        (inclusive
          ? compareIsoDates(period.dueDate, afterDate) >= 0
          : compareIsoDates(period.dueDate, afterDate) > 0)),
  );
  return (row?.emi ?? schedule.find((period) => period.principal > 0)?.emi ?? 0) as Paise;
}

function scenarioStart(scenario: SimulationScenario): {
  date?: IsoDate;
  inclusive: boolean;
} {
  if (scenario.type === "prepayment") {
    return { date: scenario.date, inclusive: false };
  }
  if (scenario.type === "recurring-prepayment") {
    return { date: scenario.firstDate, inclusive: false };
  }
  const date = [...scenario.changes]
    .map((change) => change.effectiveDate)
    .sort(compareIsoDates)[0];
  return { date, inclusive: true };
}

/** Pure what-if projection; input schedules and records are never mutated. */
export function simulate(input: SimulationInput): SimulationResult {
  const base = [...input.schedule];
  let projected = base;

  if (input.scenario.type === "prepayment") {
    projected = applyPrepayment(
      projected,
      input.scenario.amount,
      input.scenario.date,
      input.annualRatePercent,
      input.scenario.mode,
    ).schedule;
  } else if (input.scenario.type === "recurring-prepayment") {
    if (
      !Number.isInteger(input.scenario.count) ||
      input.scenario.count < 1 ||
      !Number.isInteger(input.scenario.intervalMonths) ||
      input.scenario.intervalMonths < 1
    ) {
      throw new Error("Recurring prepayment count and interval must be positive integers");
    }
    for (let index = 0; index < input.scenario.count; index += 1) {
      projected = applyPrepayment(
        projected,
        input.scenario.amount,
        addMonths(input.scenario.firstDate, index * input.scenario.intervalMonths),
        input.annualRatePercent,
        input.scenario.mode,
      ).schedule;
    }
  } else {
    projected = applyRateChanges(
      projected,
      input.annualRatePercent,
      input.scenario.changes,
    );
  }

  const baseInterest = interestTotal(base);
  const projectedInterest = interestTotal(projected);
  const start = scenarioStart(input.scenario);
  return {
    schedule: projected,
    baseInterest,
    projectedInterest,
    interestSaved: (baseInterest - projectedInterest) as Paise,
    monthsSaved: base.length - projected.length,
    baseClosureDate: base.at(-1)?.dueDate ?? null,
    projectedClosureDate: projected.at(-1)?.dueDate ?? null,
    baseEmi: firstEmi(base, start.date, start.inclusive),
    projectedEmi: firstEmi(projected, start.date, start.inclusive),
  };
}
