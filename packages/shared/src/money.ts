/** Integer representation of money in paise. */
export type Paise = number & { readonly __unit: "paise" };

/** Parse a rupee amount without using floating point for the conversion. */
export function rupeesToPaise(value: string): Paise {
  const normalized = value.replaceAll(",", "").trim();
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(normalized);
  if (match === null) {
    throw new Error("Amount must be a rupee value with at most two decimal places");
  }

  const [, sign, rupees, fraction = ""] = match;
  const paise = BigInt(rupees) * 100n + BigInt(fraction.padEnd(2, "0"));
  const signed = sign === "-" ? -paise : paise;
  const result = Number(signed);
  if (!Number.isSafeInteger(result)) {
    throw new Error("Amount is outside the safe integer range");
  }
  return result as Paise;
}

/** Validate integer paise received from storage or an API. */
export function asPaise(value: number): Paise {
  if (!Number.isSafeInteger(value)) {
    throw new Error("Paise must be a safe integer");
  }
  return value as Paise;
}

/** Round a calculated monetary amount to the nearest paisa, with halves up. */
export function roundToPaise(valueInPaise: number): Paise {
  if (!Number.isFinite(valueInPaise)) {
    throw new Error("Calculated money must be finite");
  }
  return asPaise(Math.round(valueInPaise));
}

/** Format integer paise with Indian digit grouping and two decimal places. */
export function formatIndianMoney(
  amount: Paise,
  currencySymbol = "₹",
): string {
  const sign = amount < 0 ? "-" : "";
  const absolute = Math.abs(amount);
  const rupees = Math.floor(absolute / 100);
  const paise = absolute % 100;
  const grouped = new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 0,
  }).format(rupees);
  return `${sign}${currencySymbol}${grouped}.${paise.toString().padStart(2, "0")}`;
}

/** Format a count or rate using Indian lakh/crore digit grouping. */
export function formatIndianNumber(value: number, maximumFractionDigits = 2): string {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits }).format(value);
}
