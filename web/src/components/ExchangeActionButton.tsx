import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ExchangeStatus } from "@/lib/types";

interface ExchangeActionButtonProps {
  connected: boolean;
  busy: boolean;
  status: ExchangeStatus | null;
  ctaDisabled: boolean;
  ctaLabel: string;
  statusId: string;
  onConnect: () => void;
}

export function ExchangeActionButton({
  connected,
  busy,
  status,
  ctaDisabled,
  ctaLabel,
  statusId,
  onConnect,
}: ExchangeActionButtonProps) {
  return (
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
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              {status.message}
            </span>
          ) : (
            ctaLabel
          )}
        </Button>
      )}
    </div>
  );
}
