// Keep token amounts exact by parsing decimal strings directly to bigint.
const TOKEN_DECIMALS = 6;

const MAX_INPUT_LENGTH = 64;

export function parseDecimalToBaseUnits(
  input: string,
  decimals: number = TOKEN_DECIMALS,
): bigint | null {
  const text = input.trim();
  if (text === "" || text.length > MAX_INPUT_LENGTH) {
    return null;
  }
  if (!/^(?:\d+\.?\d*|\.\d+)$/.test(text)) {
    return null;
  }
  const dot = text.indexOf(".");
  const whole = dot === -1 ? text : text.slice(0, dot);
  const fraction = dot === -1 ? "" : text.slice(dot + 1);
  if (fraction.length > decimals) {
    return null;
  }
  const padded = fraction.padEnd(decimals, "0");
  const digits = `${whole}${padded}`.replace(/^0+(?=\d)/, "");
  return BigInt(digits);
}

export function getAmountError(
  input: string,
  decimals: number = TOKEN_DECIMALS,
): string | null {
  const text = input.trim();
  if (text === "") {
    return "Enter an amount.";
  }
  if (/^-/.test(text)) {
    return "Amount must not be negative.";
  }
  if (!/^(?:\d+\.?\d*|\.\d+)$/.test(text)) {
    return "Use digits with at most one decimal point.";
  }
  const fraction = text.includes(".") ? (text.split(".")[1] ?? "") : "";
  if (fraction.length > decimals) {
    return `At most ${decimals} decimal places are supported.`;
  }
  const value = parseDecimalToBaseUnits(text, decimals);
  if (value === null) {
    return "Amount is not valid.";
  }
  if (value <= 0n) {
    return "Amount must be greater than zero.";
  }
  return null;
}

export function formatBaseUnits(
  value: bigint,
  decimals: number = TOKEN_DECIMALS,
): string {
  const negative = value < 0n;
  const digits = (negative ? -value : value)
    .toString()
    .padStart(decimals + 1, "0");
  const whole = digits
    .slice(0, digits.length - decimals)
    .replace(/^0+(?=\d)/, "");
  const fraction = digits.slice(digits.length - decimals).replace(/0+$/, "");
  const body = fraction === "" ? whole : `${whole}.${fraction}`;
  return negative ? `-${body}` : body;
}
