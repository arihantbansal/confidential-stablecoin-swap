export type ExchangeAction = "convert" | "send" | "withdraw";
export type ExchangeMode = "convert" | "send";

export interface ExchangeStatus {
  state: "working";
  message: string;
}
