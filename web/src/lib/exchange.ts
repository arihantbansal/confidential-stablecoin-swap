import { isAddress } from "@solana/kit";
import { getAmountError, parseDecimalToBaseUnits } from "@/lib/amounts";
import type { BalanceView } from "@/lib/engine";

export function getExchangeState({
  mode,
  reversed,
  amount,
  recipient,
  decimals,
  balances,
  unwrapped,
}: {
  mode: "convert" | "send";
  reversed: boolean;
  amount: string;
  recipient: string;
  decimals: number;
  balances: BalanceView;
  unwrapped: bigint | null;
}) {
  const internalAction: "convert" | "send" | "withdraw" =
    mode === "send" ? "send" : reversed ? "withdraw" : "convert";
  const displayLabel =
    mode === "send" ? "Send" : reversed ? "Make public" : "Make confidential";
  const parsed = parseDecimalToBaseUnits(amount, decimals);
  const amountError = getAmountError(amount, decimals);
  const emptyOrZero = amount.trim() === "" || parsed === 0n;
  const confidentialSource = mode === "send" || reversed;
  const sourceBalance = confidentialSource ? balances.confidential : unwrapped;
  const sourceKind = confidentialSource ? "Confidential" : "Public";
  const targetKind = reversed ? "Public" : "Confidential";
  const insufficient =
    parsed !== null && sourceBalance !== null && parsed > sourceBalance;
  const recipientBad = mode === "send" && !isAddress(recipient.trim());
  const canReview =
    parsed !== null &&
    parsed > 0n &&
    !amountError &&
    !insufficient &&
    !recipientBad &&
    sourceBalance !== null;
  const ctaLabel =
    sourceBalance === null
      ? "Balance unavailable"
      : emptyOrZero
        ? "Enter an amount"
        : insufficient
          ? "Insufficient balance"
          : displayLabel;
  return {
    internalAction,
    displayLabel,
    parsed,
    amountError,
    emptyOrZero,
    sourceBalance,
    sourceKind,
    targetKind,
    insufficient,
    recipientBad,
    canReview,
    ctaLabel,
  };
}
