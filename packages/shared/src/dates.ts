export type IsoDate = string & { readonly __format: "YYYY-MM-DD" };

export function asIsoDate(value: string): IsoDate {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("Date must use YYYY-MM-DD format");
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error("Date must be a valid calendar date");
  }
  return value as IsoDate;
}

/** Add calendar months and clamp to the final day of a shorter month. */
export function addMonths(date: IsoDate, months: number): IsoDate {
  if (!Number.isInteger(months)) {
    throw new Error("Month offset must be an integer");
  }

  const [yearText, monthText, dayText] = date.split("-");
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1 + months;
  const targetYear = year + Math.floor(monthIndex / 12);
  const targetMonthIndex = ((monthIndex % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonthIndex + 1, 0)).getUTCDate();
  const day = Math.min(Number(dayText), lastDay);
  const target = new Date(Date.UTC(targetYear, targetMonthIndex, day));
  return asIsoDate(target.toISOString().slice(0, 10));
}

export function compareIsoDates(left: IsoDate, right: IsoDate): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
