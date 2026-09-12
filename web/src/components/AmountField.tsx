import type { ReactNode, Ref } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface AmountFieldProps {
  amountId: string;
  amountErrorId: string;
  amount: string;
  amountError: string | null;
  busy: boolean;
  sourceKind: string;
  sourceBalanceText: string;
  maxDisabled: boolean;
  inputRef: Ref<HTMLInputElement>;
  assetControl: ReactNode;
  onAmountChange: (value: string) => void;
  onAmountBlur: () => void;
  onApplyMax: () => void;
}

export function AmountField({
  amountId,
  amountErrorId,
  amount,
  amountError,
  busy,
  sourceKind,
  sourceBalanceText,
  maxDisabled,
  inputRef,
  assetControl,
  onAmountChange,
  onAmountBlur,
  onApplyMax,
}: AmountFieldProps) {
  return (
    <div className="rounded-lg bg-muted/60 p-4">
      <Label htmlFor={amountId} className="sr-only">
        Amount
      </Label>
      <div className="mt-1 flex items-center gap-2">
        <Input
          ref={inputRef}
          id={amountId}
          inputMode="decimal"
          autoComplete="off"
          placeholder="0"
          value={amount}
          disabled={busy}
          onChange={(event) => onAmountChange(event.target.value)}
          onBlur={onAmountBlur}
          aria-invalid={amountError ? true : undefined}
          aria-describedby={amountError ? amountErrorId : undefined}
          className="min-h-14 rounded-md border-0 bg-transparent px-0 text-4xl md:text-4xl font-semibold tabular-nums shadow-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        />
        {assetControl}
      </div>
      <div className="flex min-h-11 items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>
          {sourceKind} balance: {sourceBalanceText}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onApplyMax}
          disabled={maxDisabled}
          className="press min-h-11 min-w-11 px-2 text-foreground disabled:opacity-40"
        >
          Max
        </Button>
      </div>
      {amountError ? (
        <p id={amountErrorId} role="alert" className="text-xs text-destructive">
          {amountError}
        </p>
      ) : null}
    </div>
  );
}
