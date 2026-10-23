import { Router } from "express";
import {
  asIsoDate,
  asPaise,
  createAmortizationSchedule,
  simulate,
  simulateRequestSchema,
} from "@loan-dashboard/shared";
import { parseInput, validateBody } from "../http/validation.js";

export function createSimulationRouter(): Router {
  const router = Router();
  router.post("/", validateBody(simulateRequestSchema), (request, response) => {
    const input = parseInput(simulateRequestSchema, request.body);
    const schedule = createAmortizationSchedule({
      principal: asPaise(input.principal),
      annualRatePercent: input.annualRatePercent,
      tenureMonths: input.tenureMonths,
      firstDueDate: asIsoDate(input.firstDueDate),
    });
    const scenario =
      input.scenario.type === "prepayment"
        ? {
            ...input.scenario,
            amount: asPaise(input.scenario.amount),
            date: asIsoDate(input.scenario.date),
          }
        : input.scenario.type === "recurring-prepayment"
          ? {
              ...input.scenario,
              amount: asPaise(input.scenario.amount),
              firstDate: asIsoDate(input.scenario.firstDate),
            }
          : {
              ...input.scenario,
              changes: input.scenario.changes.map((change) => ({
                ...change,
                effectiveDate: asIsoDate(change.effectiveDate),
              })),
            };
    response.json(
      simulate({
        schedule,
        annualRatePercent: input.annualRatePercent,
        scenario,
      }),
    );
  });
  return router;
}
