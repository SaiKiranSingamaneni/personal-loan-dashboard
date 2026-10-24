export function formatIndianMoneyInput(value: string): string {
  const clean = value.replaceAll(",", "").replace(/[^\d.]/g, "");
  const decimalIndex = clean.indexOf(".");
  const integer = decimalIndex === -1 ? clean : clean.slice(0, decimalIndex);
  const fraction = decimalIndex === -1 ? null : clean.slice(decimalIndex + 1).replaceAll(".", "");
  const grouped = integer === "" ? "" : new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Number(integer));
  return fraction === null ? grouped : `${grouped}.${fraction}`;
}

const moneyPattern = /^(?:\d+|\d{1,2}(?:,\d{2})*,\d{3})(?:\.\d{1,2})?$/;

export function isValidIndianMoneyInput(value: string): boolean {
  return value.trim() === "" || moneyPattern.test(value.trim());
}

export function amountInWords(value: string): string {
  const amount = Math.floor(Number(value.replaceAll(",", "")) || 0);
  if (amount < 100_000) return "";

  const ones = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
  const tens = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
  const underThousand = (number: number): string => {
    const words: string[] = [];
    if (number >= 100) words.push(`${ones[Math.floor(number / 100)]} hundred`);
    number %= 100;
    if (number >= 20) words.push(`${tens[Math.floor(number / 10)]}${number % 10 ? ` ${ones[number % 10]}` : ""}`);
    else if (number > 0) words.push(ones[number]);
    return words.join(" ");
  };

  let remainder = amount;
  const words: string[] = [];
  for (const [size, label] of [[10_000_000, "crore"], [100_000, "lakh"], [1_000, "thousand"], [1, ""]] as const) {
    const chunk = Math.floor(remainder / size);
    if (chunk > 0) words.push(`${underThousand(chunk)}${label ? ` ${label}` : ""}`);
    remainder %= size;
  }
  return `${words.join(" ")} rupees`;
}
