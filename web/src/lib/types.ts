export type BalanceState = "loading" | "ready" | "locked" | "error";
export type ExchangeAction = "convert" | "send" | "withdraw";
export type ExchangeMode = "convert" | "send";

export interface ExchangeStatus {
  state: "working";
  message: string;
}

export function unknownBalanceLabel(balanceState?: BalanceState): string {
  if (balanceState === "loading") return "Loading…";
  if (balanceState === "locked") return "Locked";
  if (balanceState === "error") return "Unavailable";
  return "—";
}
