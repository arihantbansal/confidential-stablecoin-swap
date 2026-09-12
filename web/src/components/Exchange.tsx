import { Loader2 } from "lucide-react";
import { useId, useRef, useState } from "react";
import { AmountField } from "@/components/AmountField";
import { AssetPicker } from "@/components/AssetPicker";
import { ExchangeMode } from "@/components/ExchangeMode";
import { ExchangeReview } from "@/components/ExchangeReview";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatBaseUnits } from "@/lib/amounts";
import type { BalanceView } from "@/lib/engine";
import { getExchangeState } from "@/lib/exchange";
import type { LocalAsset } from "@/lib/manifest";

export type ExchangeAction = "convert" | "send" | "withdraw";

export interface ExchangeStatus {
  state: "working" | "done";
  message: string;
}

export type BalanceState = "loading" | "ready" | "locked" | "error";

interface ExchangeProps {
  connected: boolean;
  balances: BalanceView;
  unwrapped: bigint | null;
  busy: boolean;
  status: ExchangeStatus | null;
  onConnect: () => void;
  onActionChange: () => void;
  onSubmit: (
    action: ExchangeAction,
    amount: bigint,
    recipient: string,
  ) => Promise<boolean>;
  asset: LocalAsset | null;
  assets: readonly LocalAsset[];
  onAssetChange: (asset: LocalAsset) => void;
  balanceState?: BalanceState;
}

type Mode = "convert" | "send";

function unknownBalanceLabel(balanceState?: BalanceState): string {
  if (balanceState === "loading") return "Loading…";
  if (balanceState === "locked") return "Locked";
  if (balanceState === "error") return "Unavailable";
  return "—";
}

function formatBalance(
  value: bigint | null,
  decimals: number,
  balanceState?: BalanceState,
): string {
  return value === null
    ? unknownBalanceLabel(balanceState)
    : formatBaseUnits(value, decimals);
}

export function Exchange({
  connected,
  balances,
  unwrapped,
  busy,
  status,
  onConnect,
  onActionChange,
  onSubmit,
  asset,
  assets,
  onAssetChange,
  balanceState,
}: ExchangeProps) {
  const [mode, setMode] = useState<Mode>("convert");
  const [reversed, setReversed] = useState(false);
  const [amount, setAmount] = useState("");
  const [recipient, setRecipient] = useState("");
  const [amountTouched, setAmountTouched] = useState(false);
  const [recipientTouched, setRecipientTouched] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [assetPickerOpen, setAssetPickerOpen] = useState(false);

  const amountId = useId();
  const amountErrorId = useId();
  const recipientId = useId();
  const recipientErrorId = useId();
  const statusId = useId();
  const amountRef = useRef<HTMLInputElement>(null);
  const recipientRef = useRef<HTMLInputElement>(null);

  const decimals = asset?.decimals ?? 6;

  const {
    internalAction,
    displayLabel,
    parsed,
    amountError: amountErrorRaw,
    emptyOrZero,
    sourceBalance,
    sourceKind,
    targetKind,
    insufficient,
    recipientBad,
    canReview,
    ctaLabel,
  } = getExchangeState({
    mode,
    reversed,
    amount,
    recipient,
    decimals,
    balances,
    unwrapped,
  });
  const amountError = amountTouched && !emptyOrZero ? amountErrorRaw : null;
  const recipientError =
    recipientTouched && recipientBad
      ? "Enter a valid recipient address."
      : null;

  function clearForm() {
    setAmount("");
    setAmountTouched(false);
    setRecipientTouched(false);
  }

  function applyMax() {
    if (sourceBalance !== null && sourceBalance > 0n) {
      setAmount(formatBaseUnits(sourceBalance, decimals));
      setAmountTouched(false);
    }
  }

  function openReview() {
    if (emptyOrZero || insufficient) {
      return;
    }
    if (amountErrorRaw) {
      setAmountTouched(true);
      amountRef.current?.focus();
      return;
    }
    if (mode === "send" && recipientBad) {
      setRecipientTouched(true);
      recipientRef.current?.focus();
      return;
    }
    if (canReview) {
      setReviewOpen(true);
    }
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) {
      return;
    }
    openReview();
  }

  async function confirm() {
    if (busy || !canReview || parsed === null) {
      return;
    }
    setReviewOpen(false);
    const ok = await onSubmit(internalAction, parsed, recipient.trim());
    if (ok) {
      clearForm();
    }
  }

  async function finishConversion() {
    if (balances.public === null || balances.public <= 0n) {
      return;
    }
    const ok = await onSubmit("withdraw", balances.public, "");
    if (ok) {
      clearForm();
    }
  }

  function switchMode(next: Mode) {
    if (next === mode || busy) {
      return;
    }
    setMode(next);
    setAmountTouched(false);
    setRecipientTouched(false);
    onActionChange();
  }

  function handleAssetSelect(candidate: LocalAsset) {
    onAssetChange(candidate);
    setAssetPickerOpen(false);
    setAmountTouched(false);
    onActionChange();
  }

  const ctaDisabled =
    busy || emptyOrZero || insufficient || sourceBalance === null;
  const symbol = asset?.symbol ?? "—";

  return (
    <section aria-label="Exchange" tabIndex={-1} className="w-full rounded-xl">
      <Card className="gap-0 py-0">
        <CardContent className="p-4">
          <ExchangeMode
            mode={mode}
            busy={busy}
            sourceKind={sourceKind}
            targetKind={targetKind}
            onModeChange={switchMode}
            onReverse={() => {
              setReversed((value) => !value);
              setAmountTouched(false);
              onActionChange();
            }}
          />
          <form onSubmit={handleSubmit}>
            <div className="mt-4 space-y-2">
              <AmountField
                amountId={amountId}
                amountErrorId={amountErrorId}
                amount={amount}
                amountError={amountError}
                busy={busy}
                sourceKind={sourceKind}
                sourceBalanceText={formatBalance(
                  sourceBalance,
                  decimals,
                  connected ? balanceState : undefined,
                )}
                maxDisabled={
                  busy || sourceBalance === null || sourceBalance <= 0n
                }
                inputRef={amountRef}
                assetControl={
                  <AssetPicker
                    asset={asset}
                    assets={assets}
                    open={assetPickerOpen}
                    busy={busy}
                    onOpenChange={setAssetPickerOpen}
                    onSelect={handleAssetSelect}
                  />
                }
                onAmountChange={(value) => {
                  setAmount(value);
                  setAmountTouched(false);
                }}
                onAmountBlur={() => setAmountTouched(true)}
                onApplyMax={applyMax}
              />

              {mode === "send" ? (
                <div className="space-y-2">
                  <Label
                    htmlFor={recipientId}
                    className="text-sm text-muted-foreground"
                  >
                    To
                  </Label>
                  <Input
                    ref={recipientRef}
                    id={recipientId}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="Recipient address"
                    value={recipient}
                    disabled={busy}
                    onChange={(event) => {
                      setRecipient(event.target.value);
                      setRecipientTouched(false);
                    }}
                    onBlur={(event) => {
                      if (event.target.value.trim() !== "") {
                        setRecipientTouched(true);
                      }
                    }}
                    aria-invalid={recipientError ? true : undefined}
                    aria-describedby={
                      recipientError ? recipientErrorId : undefined
                    }
                    className="min-h-11 font-mono text-base md:text-sm"
                  />
                  {recipientError ? (
                    <p
                      id={recipientErrorId}
                      role="alert"
                      className="text-xs text-destructive"
                    >
                      {recipientError}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="mt-4">
              {!connected ? (
                <Button
                  type="button"
                  onClick={onConnect}
                  className="press min-h-11 w-full"
                >
                  Connect wallet
                </Button>
              ) : (
                <Button
                  type="submit"
                  disabled={ctaDisabled}
                  className="press min-h-11 w-full"
                  aria-describedby={statusId}
                >
                  {busy && status?.state === "working" ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2
                        className="size-4 animate-spin"
                        aria-hidden="true"
                      />
                      {status.message}
                    </span>
                  ) : (
                    ctaLabel
                  )}
                </Button>
              )}
            </div>
          </form>
          <p id={statusId} role="status" className="sr-only">
            {status?.message ?? ""}
          </p>

          {connected && balances.public !== null && balances.public > 0n ? (
            <div className="mt-4 space-y-2">
              <p className="text-sm text-muted-foreground">
                {formatBaseUnits(balances.public, decimals)} {symbol} is ready
                to return to your public balance.
              </p>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                className="press min-h-11 w-full"
                onClick={() => void finishConversion()}
              >
                Finish conversion
              </Button>
            </div>
          ) : null}

          <ExchangeReview
            open={reviewOpen}
            busy={busy || !canReview}
            mode={mode}
            parsed={parsed}
            decimals={decimals}
            symbol={symbol}
            recipient={recipient}
            internalAction={internalAction}
            confirmLabel={displayLabel}
            onOpenChange={setReviewOpen}
            onConfirm={() => void confirm()}
          />
        </CardContent>
      </Card>
    </section>
  );
}
