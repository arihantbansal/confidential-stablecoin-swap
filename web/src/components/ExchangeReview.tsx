import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatBaseUnits } from "@/lib/amounts";

type ReviewMode = "convert" | "send";
type ReviewAction = "convert" | "send" | "withdraw";

interface ExchangeReviewProps {
  open: boolean;
  busy: boolean;
  mode: ReviewMode;
  parsed: bigint | null;
  decimals: number;
  symbol: string;
  recipient: string;
  internalAction: ReviewAction;
  confirmLabel: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export function ExchangeReview({
  open,
  busy,
  mode,
  parsed,
  decimals,
  symbol,
  recipient,
  internalAction,
  confirmLabel,
  onOpenChange,
  onConfirm,
}: ExchangeReviewProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent returnFocus>
        <DialogHeader>
          <DialogTitle>
            {mode === "send" ? "Send" : "Make"}{" "}
            {parsed !== null && parsed > 0n
              ? formatBaseUnits(parsed, decimals)
              : ""}{" "}
            {symbol}
            {mode === "convert"
              ? ` ${internalAction === "withdraw" ? "public" : "confidential"}`
              : ""}
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
            onClick={() => onOpenChange(false)}
            className="press min-h-11"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="press min-h-11"
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
