import { Button } from "@/components/ui/button";
import { formatBaseUnits } from "@/lib/amounts";

interface ExchangePendingConversionProps {
  connected: boolean;
  publicBalance: bigint | null;
  decimals: number;
  symbol: string;
  busy: boolean;
  onFinish: () => void;
}

export function ExchangePendingConversion({
  connected,
  publicBalance,
  decimals,
  symbol,
  busy,
  onFinish,
}: ExchangePendingConversionProps) {
  if (!connected || publicBalance === null || publicBalance <= 0n) {
    return null;
  }

  return (
    <div className="mt-4 space-y-2">
      <p className="text-sm text-muted-foreground">
        {formatBaseUnits(publicBalance, decimals)} {symbol} is ready to return
        to your public balance.
      </p>
      <Button
        type="button"
        variant="outline"
        disabled={busy}
        className="press min-h-11 w-full"
        onClick={onFinish}
      >
        Finish conversion
      </Button>
    </div>
  );
}
