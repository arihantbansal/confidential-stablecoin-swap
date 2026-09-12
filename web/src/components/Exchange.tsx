import { isAddress } from "@solana/kit";
import { Loader2 } from "lucide-react";
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
  onCreateWallet: () => void;
  onActionChange: () => void;
  onApplyPending: () => void;
  onSubmit: (action: ExchangeAction, amount: bigint, recipient: string) => void;
}

const ACTIONS: ExchangeAction[] = ["convert", "send", "withdraw"];

const ACTION_LABEL: Record<ExchangeAction, string> = {
  convert: "Convert",
  send: "Send",
  withdraw: "Withdraw",
};

function isRecipient(value: string): boolean {
  return value.trim() !== "" && isAddress(value.trim());
}

export function Exchange({
  connected,
  balances,
  unwrapped,
  busy,
  status,
  onCreateWallet,
  onActionChange,
  onApplyPending,
  onSubmit,
}: ExchangeProps) {
  const [action, setAction] = useState<ExchangeAction>("convert");
  const [amount, setAmount] = useState("");
  const [recipient, setRecipient] = useState("");
  const [amountTouched, setAmountTouched] = useState(false);
  const [recipientTouched, setRecipientTouched] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);

  const amountId = useId();
  const amountErrorId = useId();
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

  const parsed = parseDecimalToBaseUnits(amount);
  const amountErrorRaw = getAmountError(amount);
  const amountError = amountTouched ? amountErrorRaw : null;
  const recipientBad = action === "send" && !isRecipient(recipient);
  const recipientError = recipientTouched
    ? recipientBad
      ? "Enter a valid recipient address."
      : null
    : null;
  const canReview =
    parsed !== null &&
    parsed > 0n &&
    (action !== "send" || isRecipient(recipient));

  const tokenLabel = action === "convert" ? "Test USD" : "Wrapped Test USD";
  const spendable = action === "convert" ? unwrapped : balances.confidential;
  const balanceLine =
    action === "convert"
      ? unwrapped === null
        ? null
        : `${formatBaseUnits(unwrapped)} Test USD`
      : balances.confidential === null
        ? null
        : `${formatBaseUnits(balances.confidential)} available` +
          (balances.pending !== null && balances.pending > 0n
            ? ` · ${formatBaseUnits(balances.pending)} pending`
            : "");
  const showApplyPending =
    connected && balances.pending !== null && balances.pending > 0n && !busy;

  function applyMax() {
    if (spendable !== null && spendable > 0n) {
      setAmount(formatBaseUnits(spendable));
      setAmountTouched(false);
    }
  }

  function openReview() {
    if (amountErrorRaw) {
      setAmountTouched(true);
      amountRef.current?.focus();
      return;
    }
    if (action === "send" && recipientBad) {
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
    onSubmit(action, parsed, recipient.trim());
  }

  const activeIndex = ACTIONS.indexOf(action);

  return (
    <section
      aria-label="Exchange"
      className="rounded-xl border bg-card p-5 text-card-foreground shadow-sm"
    >
      <fieldset
        aria-label="Action"
        disabled={busy}
        className="relative m-0 grid min-w-0 grid-cols-3 rounded-lg border-0 bg-muted p-1"
      >
        <span
          aria-hidden="true"
          className="seg-thumb absolute inset-y-1 left-1 w-[calc((100%-0.5rem)/3)] rounded-md bg-card shadow-xs"
          style={{ transform: `translateX(${activeIndex * 100}%)` }}
        />
        {ACTIONS.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={action === value}
            disabled={busy}
            onClick={() => {
              setAction(value);
              setAmountTouched(false);
              setRecipientTouched(false);
              onActionChange();
            }}
            className="relative z-10 min-h-11 rounded-md text-sm font-medium text-muted-foreground transition-colors duration-150 aria-pressed:text-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
          >
            {ACTION_LABEL[value]}
          </button>
        ))}
      </fieldset>

      <form onSubmit={handleSubmit}>
        <div className="mt-5">
          <div className="flex items-baseline justify-between gap-3">
            <Label htmlFor={amountId} className="text-sm text-muted-foreground">
              Amount
            </Label>
            {balanceLine !== null ? (
              <p className="text-xs text-muted-foreground tabular-nums">
                {balanceLine}{" "}
                <button
                  type="button"
                  onClick={applyMax}
                  disabled={busy || spendable === null || spendable <= 0n}
                  className="inline-flex min-h-11 min-w-11 items-center justify-center px-2 py-2 font-medium text-foreground underline-offset-4 hover:underline disabled:no-underline disabled:opacity-40"
                >
                  Max
                </button>
              </p>
            ) : null}
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
              className="min-h-14 rounded-md border-0 bg-transparent px-2 text-4xl md:text-4xl font-semibold tabular-nums shadow-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
            <span className="shrink-0 text-sm text-muted-foreground">
              {tokenLabel}
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

        {action === "send" ? (
          <div className="mt-4 space-y-2">
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
              onBlur={() => setRecipientTouched(true)}
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
        ) : null}

        <div className="mt-5">
          {!connected ? (
            <Button
              type="button"
              onClick={onCreateWallet}
              className="press min-h-11 w-full"
            >
              Create test wallet
            </Button>
          ) : (
            <Button
              type="submit"
              disabled={busy}
              className="press min-h-11 w-full"
            >
              {busy && status?.state === "working" ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  {status.message}
                </span>
              ) : (
                ACTION_LABEL[action]
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
            Accept payment
          </Button>
        </div>
      ) : null}

      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {ACTION_LABEL[action]}{" "}
              {parsed !== null && parsed > 0n ? formatBaseUnits(parsed) : ""}{" "}
              {tokenLabel}
            </DialogTitle>
            <DialogDescription>
              {action === "send"
                ? `To ${recipient.trim()}`
                : action === "withdraw"
                  ? "The withdrawal amount will be public."
                  : "Deposit amounts are public."}
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
              {ACTION_LABEL[action]}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
