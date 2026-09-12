import { Check, ChevronDown } from "lucide-react";
import { TokenMark } from "@/components/TokenMark";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { LocalAsset } from "@/lib/manifest";
import { getTokenIcon } from "@/lib/token-icons";

interface AssetPickerProps {
  asset: LocalAsset | null;
  assets: readonly LocalAsset[];
  open: boolean;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (asset: LocalAsset) => void;
}

export function AssetPicker({
  asset,
  assets,
  open,
  busy,
  onOpenChange,
  onSelect,
}: AssetPickerProps) {
  const symbol = asset?.symbol ?? "—";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          disabled={busy || assets.length === 0}
          aria-label={`Select asset, currently ${symbol}`}
          className="press min-h-11 rounded-full px-2.5 font-semibold"
        >
          {asset ? <TokenMark asset={asset} /> : null}
          {symbol}
          <ChevronDown
            className="size-4 text-muted-foreground"
            aria-hidden="true"
          />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm gap-3 p-4 sm:max-w-sm">
        <DialogHeader className="gap-1 pr-8">
          <DialogTitle>Choose an asset</DialogTitle>
          <DialogDescription className="sr-only">
            Select the token to use for this exchange.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-1">
          {assets.map((candidate) => {
            const selected = candidate.symbol === asset?.symbol;
            return (
              <Button
                key={candidate.symbol}
                type="button"
                variant="ghost"
                aria-pressed={selected}
                className="min-h-11 w-full justify-between rounded-lg px-3 text-left aria-pressed:bg-muted"
                onClick={() => onSelect(candidate)}
              >
                <span className="flex items-center gap-3">
                  <TokenMark asset={candidate} large />
                  <span>
                    <span className="block">{candidate.symbol}</span>
                    {getTokenIcon(candidate.mint)?.name &&
                    getTokenIcon(candidate.mint)?.name !== candidate.symbol ? (
                      <span className="block text-xs font-normal text-muted-foreground">
                        {getTokenIcon(candidate.mint)?.name}
                      </span>
                    ) : null}
                  </span>
                </span>
                {selected ? (
                  <Check
                    className="size-4 text-foreground"
                    aria-hidden="true"
                  />
                ) : null}
              </Button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
