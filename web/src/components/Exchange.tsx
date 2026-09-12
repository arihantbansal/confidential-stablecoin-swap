import { isAddress } from "@solana/kit";
import { ArrowUpDown, Loader2 } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  formatBaseUnits,
  getAmountError,
  parseDecimalToBaseUnits,
} from "@/lib/amounts";
import type { BalanceView } from "@/lib/engine";

export type ExchangeAction = "convert" | "send" | "withdraw";

export interface ExchangeStatus {
  state: "working" | "done" | "error";
  message: string;
  detail?: string;
}

interface ExchangeProps {
  connected: boolean;
  balances: BalanceView;
  unwrapped: bigint | null;
  busy: boolean;
  status: ExchangeStatus | null;
  onConnect: () => void;
  onActionChange: () => void;
  onApplyPending: () => void;
  onSubmit: (action: ExchangeAction, amount: bigint, recipient: string) => void;
}

type Mode = "convert" | "send";

const MODES: Mode[] = ["convert", "send"];

const MODE_LABEL: Record<Mode, string> = {
  convert: "Convert",
  send: "Send",
};

function isRecipient(value: string): boolean {
  return value.trim() !== "" && isAddress(value.trim());
}

function formatBalance(value: bigint | null): string {
  return value === null ? "—" : formatBaseUnits(value);
}

export function Exchange({
  connected,
  balances,
  unwrapped,
  busy,
  status,
  onConnect,
  onActionChange,
  onApplyPending,
  onSubmit,
}: ExchangeProps) {
  const [mode, setMode] = useState<Mode>("convert");
  const [reversed, setReversed] = useState(false);
  const [amount, setAmount] = useState("");
  const [recipient, setRecipient] = useState("");
  const [amountTouched, setAmountTouched] = useState(false);
  const [recipientTouched, setRecipientTouched] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);

  const amountId = useId();
  const amountErrorId = useId();
  const outputId = useId();
  const recipientId = useId();
  const recipientErrorId = useId();
  const amountRef = useRef<HTMLInputElement>(null);
  const recipientRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (status?.state === "done") {
      setAmount("");
      setAmountTouched(false);
      setRecipientTouched(false);
    }
  }, [status]);

  const internalAction: ExchangeAction =
    mode === "send" ? "send" : reversed ? "withdraw" : "convert";
  const displayLabel = mode === "send" ? "Send" : "Convert";

  const parsed = parseDecimalToBaseUnits(amount);
  const amountErrorRaw = getAmountError(amount);
  const emptyOrZero = amount.trim() === "" || parsed === 0n;
  const amountError = amountTouched && !emptyOrZero ? amountErrorRaw : null;

  const sourceBalance =
    mode === "send"
      ? balances.confidential
      : reversed
        ? balances.confidential
        : unwrapped;
  const targetBalance =
    mode === "send" ? null : reversed ? unwrapped : balances.confidential;
  const sourceKind =
    mode === "send" ? "Confidential" : reversed ? "Confidential" : "Public";
  const targetKind = reversed ? "Public" : "Confidential";

  const insufficient =
    !emptyOrZero &&
    parsed !== null &&
    parsed > 0n &&
    sourceBalance !== null &&
    parsed > sourceBalance;

  const recipientBad = mode === "send" && !isRecipient(recipient);
  const recipientError =
    recipientTouched && recipientBad
      ? "Enter a valid recipient address."
      : null;
  const canReview =
    parsed !== null &&
    parsed > 0n &&
    amountErrorRaw === null &&
    !insufficient &&
    (mode !== "send" || isRecipient(recipient));

  const outputValue =
    parsed !== null && parsed > 0n ? formatBaseUnits(parsed) : "";

  const showApplyPending =
    connected && balances.pending !== null && balances.pending > 0n && !busy;

  function applyMax() {
    if (sourceBalance !== null && sourceBalance > 0n) {
      setAmount(formatBaseUnits(sourceBalance));
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

  function confirm() {
    if (parsed === null || parsed <= 0n) {
      return;
    }
    setReviewOpen(false);
    onSubmit(internalAction, parsed, recipient.trim());
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

  const activeIndex = MODES.indexOf(mode);
  const ctaDisabled = busy || emptyOrZero || insufficient;
  const ctaLabel = emptyOrZero
    ? "Enter an amount"
    : insufficient
      ? "Insufficient balance"
      : displayLabel;

  return (
    <section
      aria-label="Exchange"
      className="w-full rounded-xl border bg-card p-4 text-card-foreground shadow-sm"
    >
      <fieldset
        aria-label="Action"
        disabled={busy}
        className="relative m-0 grid min-w-0 grid-cols-2 rounded-lg border-0 bg-muted p-1"
      >
        <span
          aria-hidden="true"
          className="seg-thumb absolute inset-y-1 left-1 w-[calc((100%-0.5rem)/2)] rounded-md bg-card shadow-xs"
          style={{ transform: `translateX(${activeIndex * 100}%)` }}
        />
        {MODES.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={mode === value}
            disabled={busy}
            onClick={() => switchMode(value)}
            className="relative z-10 min-h-11 rounded-md text-sm font-medium text-muted-foreground transition-colors duration-150 aria-pressed:text-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
          >
            {MODE_LABEL[value]}
          </button>
        ))}
      </fieldset>

      <form onSubmit={handleSubmit}>
        <div className="mt-4 space-y-2">
          <div className="rounded-lg border bg-muted/60 p-4">
            <div className="flex min-h-11 items-center justify-between gap-3">
              <Label
                htmlFor={amountId}
                className="text-sm text-muted-foreground"
              >
                From {sourceKind}
              </Label>
              <p className="text-xs text-muted-foreground tabular-nums">
                Balance: {formatBalance(sourceBalance)}{" "}
                <button
                  type="button"
                  onClick={applyMax}
                  disabled={
                    busy || sourceBalance === null || sourceBalance <= 0n
                  }
                  className="inline-flex min-h-11 min-w-11 items-center justify-center px-2 py-2 font-medium text-foreground underline-offset-4 hover:underline disabled:no-underline disabled:opacity-40"
                >
                  Max
                </button>
              </p>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <Input
                ref={amountRef}
                id={amountId}
                inputMode="decimal"
                autoComplete="off"
                placeholder="0"
                value={amount}
                disabled={busy}
                onChange={(event) => {
                  setAmount(event.target.value);
                  setAmountTouched(false);
                }}
                onBlur={() => setAmountTouched(true)}
                aria-invalid={amountError ? true : undefined}
                aria-describedby={amountError ? amountErrorId : undefined}
                className="min-h-14 rounded-md border-0 bg-transparent px-0 text-4xl md:text-4xl font-semibold tabular-nums shadow-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
              <span className="shrink-0 text-sm text-muted-foreground">
                Test USD
              </span>
            </div>
            {amountError ? (
              <p
                id={amountErrorId}
                role="alert"
                className="text-xs text-destructive"
              >
                {amountError}
              </p>
            ) : null}
          </div>

          {mode === "convert" ? (
            <>
              <div className="relative z-10 -my-5 flex justify-center">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  disabled={busy}
                  onClick={() => {
                    setReversed((value) => !value);
                    setAmountTouched(false);
                  }}
                  aria-label="Reverse conversion direction"
                  className="press min-h-11 min-w-11 rounded-full border-4 border-card bg-card"
                >
                  <ArrowUpDown aria-hidden="true" />
                </Button>
              </div>

              <div className="rounded-lg border bg-muted/60 p-4">
                <div className="flex min-h-11 items-center justify-between gap-3">
                  <p className="text-sm text-muted-foreground">
                    To {targetKind}
                  </p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    Balance: {formatBalance(targetBalance)}
                  </p>
                </div>
                <div className="mt-1 flex min-h-14 items-center gap-2">
                  <output
                    id={outputId}
                    htmlFor={amountId}
                    aria-live="polite"
                    className="min-w-0 flex-1 overflow-x-auto text-4xl md:text-4xl font-semibold tabular-nums"
                  >
                    {outputValue === "" ? "0" : outputValue}
                  </output>
                  <span className="shrink-0 text-sm text-muted-foreground">
                    Test USD
                  </span>
                </div>
              </div>
            </>
          ) : (
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
                aria-describedby={recipientError ? recipientErrorId : undefined}
                className="min-h-11 font-mono text-xs"
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
          )}
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
            >
              {busy && status?.state === "working" ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  {status.message}
                </span>
              ) : (
                ctaLabel
              )}
            </Button>
          )}
        </div>
      </form>

      {showApplyPending ? (
        <div className="mt-2">
          <Button
            type="button"
            variant="outline"
            onClick={onApplyPending}
            className="press min-h-11 w-full"
          >
            Accept {formatBaseUnits(balances.pending ?? 0n)} Test USD
          </Button>
        </div>
      ) : null}

      {connected && balances.public !== null && balances.public > 0n ? (
        <div className="mt-4 space-y-2">
          <p className="text-sm text-muted-foreground">
            {formatBaseUnits(balances.public)} Test USD is ready to return to
            your public balance.
          </p>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            className="press min-h-11 w-full"
            onClick={() => onSubmit("withdraw", balances.public ?? 0n, "")}
          >
            Finish conversion
          </Button>
        </div>
      ) : null}

      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {displayLabel}{" "}
              {parsed !== null && parsed > 0n ? formatBaseUnits(parsed) : ""}{" "}
              Test USD
            </DialogTitle>
            <DialogDescription>
              {mode === "send"
                ? `To ${recipient.trim()}`
                : internalAction === "withdraw"
                  ? "Confidential to public. The amount will be visible."
                  : "Public to confidential. The deposit amount remains visible."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setReviewOpen(false)}
              className="press min-h-11"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={confirm}
              disabled={busy}
              className="press min-h-11"
            >
              {displayLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
