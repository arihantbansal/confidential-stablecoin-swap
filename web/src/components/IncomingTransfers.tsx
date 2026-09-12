import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { TokenMark } from "@/components/TokenMark";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatBaseUnits } from "@/lib/amounts";
import type { LocalAsset } from "@/lib/manifest";

interface IncomingTransfer {
  asset: LocalAsset;
  amount: bigint | null;
}

interface IncomingTransfersProps {
  items: IncomingTransfer[];
  applyingMint: string | null;
  busy: boolean;
  onApply: (asset: LocalAsset) => void;
}

interface RenderedTransfer extends IncomingTransfer {
  exiting: boolean;
}

function keyOf(asset: LocalAsset): string {
  return asset.mint.toString();
}

function transferLabel({ asset, amount }: IncomingTransfer): string {
  return amount === null
    ? `${asset.symbol} received`
    : `${formatBaseUnits(amount, asset.decimals)} ${asset.symbol} received`;
}

export function IncomingTransfers({
  items,
  applyingMint,
  busy,
  onApply,
}: IncomingTransfersProps) {
  const [rendered, setRendered] = useState<RenderedTransfer[]>([]);
  const [announcement, setAnnouncement] = useState("");
  const [focusRecovery, setFocusRecovery] = useState<{
    removedKey: string;
    nextKey: string | undefined;
  } | null>(null);
  const previousKeysRef = useRef<string[]>([]);
  const lastFocusedKeyRef = useRef<string | null>(null);
  const buttonRefs = useRef(new Map<string, HTMLButtonElement>());
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const nextKeys = items.map((item) => keyOf(item.asset));
    const nextByKey = new Map(items.map((item) => [keyOf(item.asset), item]));
    const previousKeys = previousKeysRef.current;
    const removedKeys = previousKeys.filter((key) => !nextByKey.has(key));
    const addedItems = items.filter(
      (item) => !previousKeys.includes(keyOf(item.asset)),
    );
    setRendered((current) => {
      const currentKeys = new Set(current.map((item) => keyOf(item.asset)));
      return [
        ...current.map((item) => {
          const next = nextByKey.get(keyOf(item.asset));
          return next
            ? { ...next, exiting: false }
            : { ...item, exiting: true };
        }),
        ...items
          .filter((item) => !currentKeys.has(keyOf(item.asset)))
          .map((item) => ({ ...item, exiting: false })),
      ];
    });

    setAnnouncement(
      addedItems.length === 0
        ? ""
        : addedItems.length === 1
          ? transferLabel(addedItems[0])
          : "Incoming funds received",
    );

    const focusedKey = lastFocusedKeyRef.current;
    const activeElement = document.activeElement;
    if (
      focusedKey &&
      removedKeys.includes(focusedKey) &&
      (activeElement === document.body ||
        (activeElement instanceof HTMLButtonElement &&
          activeElement.dataset.incomingMint === focusedKey))
    ) {
      const oldIndex = previousKeys.indexOf(focusedKey);
      setFocusRecovery({
        removedKey: focusedKey,
        nextKey: nextKeys[Math.min(oldIndex, nextKeys.length - 1)],
      });
    }

    previousKeysRef.current = nextKeys;
  }, [items]);

  useEffect(() => {
    if (!focusRecovery || busy) return;
    const frame = window.requestAnimationFrame(() => {
      const activeElement = document.activeElement;
      const focusIsStillLost =
        activeElement === document.body ||
        (activeElement instanceof HTMLButtonElement &&
          activeElement.dataset.incomingMint === focusRecovery.removedKey);
      if (focusIsStillLost) {
        const nextButton = focusRecovery.nextKey
          ? buttonRefs.current.get(focusRecovery.nextKey)
          : undefined;
        if (nextButton && !nextButton.disabled) {
          nextButton.focus();
        } else {
          containerRef.current?.parentElement
            ?.querySelector<HTMLElement>('[aria-label="Exchange"]')
            ?.focus();
        }
      }
      lastFocusedKeyRef.current = null;
      setFocusRecovery(null);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [busy, focusRecovery]);

  const hasVisibleRows = rendered.some((item) => !item.exiting);

  return (
    <div
      ref={containerRef}
      style={{
        marginBlockEnd: hasVisibleRows ? "0.75rem" : "0rem",
        transition: "margin-block-end 200ms cubic-bezier(0.2, 0, 0, 1)",
      }}
    >
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </span>
      <div
        className="incoming-transfer-row-shell"
        data-exiting={hasVisibleRows ? undefined : "true"}
      >
        <div className="incoming-transfer-row-clip">
          {rendered.length > 0 ? (
            <Card
              role="region"
              aria-label="Incoming transfers"
              className="gap-0 overflow-hidden py-0"
            >
              <CardContent className="p-0">
                {rendered.map((item, index) => {
                  const key = keyOf(item.asset);
                  const applying = applyingMint === key;
                  return (
                    <div
                      key={key}
                      className="incoming-transfer-row-shell"
                      data-exiting={item.exiting ? "true" : undefined}
                      onTransitionEnd={(event) => {
                        if (
                          item.exiting &&
                          event.propertyName === "grid-template-rows"
                        ) {
                          setRendered((current) =>
                            current.filter(
                              (candidate) => keyOf(candidate.asset) !== key,
                            ),
                          );
                        }
                      }}
                    >
                      <div className="incoming-transfer-row-clip">
                        <div
                          className={`incoming-transfer-row ${index > 0 ? "border-t" : ""}`}
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <TokenMark asset={item.asset} large />
                            <p className="min-w-0 text-sm font-medium tabular-nums">
                              {transferLabel(item)}
                            </p>
                          </div>
                          <Button
                            ref={(node) => {
                              if (node) buttonRefs.current.set(key, node);
                              else buttonRefs.current.delete(key);
                            }}
                            type="button"
                            variant="outline"
                            disabled={busy || item.exiting}
                            data-incoming-mint={key}
                            aria-label={
                              applying
                                ? `Adding ${item.asset.symbol} to balance`
                                : `Add ${item.asset.symbol} to balance`
                            }
                            onFocus={() => {
                              lastFocusedKeyRef.current = key;
                            }}
                            onClick={() => {
                              lastFocusedKeyRef.current = key;
                              onApply(item.asset);
                            }}
                            className="press min-h-11 px-3"
                          >
                            {applying ? (
                              <>
                                <Loader2
                                  className="size-4 animate-spin"
                                  aria-hidden="true"
                                />
                                Adding…
                              </>
                            ) : (
                              "Add to balance"
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
