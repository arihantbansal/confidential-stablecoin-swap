/**
 * Pure decimal <-> base-unit conversions for the six-decimal test tokens.
 *
 * Everything here is intentionally free of Number arithmetic: amounts are
 * parsed and formatted with bigint so large values stay exact. Invalid input
 * is reported as `null` rather than throwing, so form fields can render
 * inline accessible errors.
 */

/** Decimals used by Test USD and Wrapped Test USD. */
export const TOKEN_DECIMALS = 6;

/** Largest accepted fraction length; kept separate so tests pin the rule. */
const MAX_INPUT_LENGTH = 64;

/**
 * Parse a user-typed decimal string into integer base units.
 *
 * Returns `null` for empty input, negative values, excess precision, or any
 * shape that is not exactly `<digits>[.<digits>]`. No custody, network, or
 * cryptographic behavior lives here.
 */
export function parseDecimalToBaseUnits(
  input: string,
  decimals: number = TOKEN_DECIMALS,
): bigint | null {
  const text = input.trim();
  if (text === "" || text.length > MAX_INPUT_LENGTH) {
    return null;
  }
  if (!/^\d+(\.\d+)?$/.test(text)) {
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
  try {
    return BigInt(digits === "" ? "0" : digits);
  } catch {
    return null;
  }
}

/**
 * Explain why an amount string is invalid, or `null` when it parses.
 * Used for inline form errors announced to screen readers.
 */
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
  if (!/^\d+(\.\d+)?$/.test(text)) {
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

/**
 * Format integer base units as a decimal string without precision loss.
 * Trailing fractional zeros are trimmed, so 1_000_000n renders as "1".
 */
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
