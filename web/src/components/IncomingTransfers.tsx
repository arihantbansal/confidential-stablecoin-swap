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

interface PresenceState {
  items: IncomingTransfer[];
  rendered: RenderedTransfer[];
  removedFocus: FocusRecovery[];
}

interface FocusRecovery {
  removedKey: string;
  nextKey: string | undefined;
}

function keyOf(asset: LocalAsset): string {
  return asset.mint.toString();
}

function transferLabel({ asset, amount }: IncomingTransfer): string {
  return amount === null
    ? `${asset.symbol} received`
    : `${formatBaseUnits(amount, asset.decimals)} ${asset.symbol} received`;
}

function sameTransfer(
  left: IncomingTransfer,
  right: IncomingTransfer,
): boolean {
  return (
    keyOf(left.asset) === keyOf(right.asset) && left.amount === right.amount
  );
}

function sameTransfers(
  left: IncomingTransfer[],
  right: IncomingTransfer[],
): boolean {
  return (
    left.length === right.length &&
    left.every((item, index) => sameTransfer(item, right[index]))
  );
}

function reconcileRendered(
  current: RenderedTransfer[],
  items: IncomingTransfer[],
): RenderedTransfer[] {
  const nextByKey = new Map(items.map((item) => [keyOf(item.asset), item]));
  const currentKeys = new Set(current.map((item) => keyOf(item.asset)));
  return [
    ...current.map((item) => {
      const next = nextByKey.get(keyOf(item.asset));
      return next ? { ...next, exiting: false } : { ...item, exiting: true };
    }),
    ...items
      .filter((item) => !currentKeys.has(keyOf(item.asset)))
      .map((item) => ({ ...item, exiting: false })),
  ];
}

export function IncomingTransfers({
  items,
  applyingMint,
  busy,
  onApply,
}: IncomingTransfersProps) {
  const [announcement, setAnnouncement] = useState("");
  const focusRecoveryRef = useRef<FocusRecovery | null>(null);
  const lastFocusedKeyRef = useRef<string | null>(null);
  const buttonRefs = useRef(new Map<string, HTMLButtonElement>());
  const containerRef = useRef<HTMLDivElement>(null);

  const [presence, setPresence] = useState<PresenceState>(() => ({
    items: [],
    rendered: [],
    removedFocus: [],
  }));

  if (!sameTransfers(presence.items, items)) {
    const previousKeys = presence.items.map((item) => keyOf(item.asset));
    const previousKeySet = new Set(previousKeys);
    const nextKeys = items.map((item) => keyOf(item.asset));
    const nextKeySet = new Set(nextKeys);
    const addedItems = items.filter(
      (item) => !previousKeySet.has(keyOf(item.asset)),
    );
    const removedFocus: FocusRecovery[] = [];
    previousKeys.forEach((key, index) => {
      if (nextKeySet.has(key)) return;
      removedFocus.push({
        removedKey: key,
        nextKey:
          nextKeys.length > 0
            ? nextKeys[Math.min(index, nextKeys.length - 1)]
            : undefined,
      });
    });

    // Presence is state because removed rows must stay mounted until their
    // exit transition ends. Reconcile changed items before committing them.
    setPresence({
      items,
      rendered: reconcileRendered(presence.rendered, items),
      removedFocus,
    });
    setAnnouncement(
      addedItems.length === 0
        ? ""
        : addedItems.length === 1
          ? transferLabel(addedItems[0])
          : "Incoming funds received",
    );
  }

  const renderedTransfers = presence.rendered;

  useEffect(() => {
    const focusedKey = lastFocusedKeyRef.current;
    const candidate = presence.removedFocus.find(
      (recovery) => recovery.removedKey === focusedKey,
    );
    const activeElement = document.activeElement;
    if (
      candidate &&
      (activeElement === document.body ||
        (activeElement instanceof HTMLButtonElement &&
          activeElement.dataset.incomingMint === candidate.removedKey))
    )
      focusRecoveryRef.current = candidate;

    const recovery = focusRecoveryRef.current;
    if (!recovery || busy) return;
    const frame = window.requestAnimationFrame(() => {
      const activeElement = document.activeElement;
      const focusIsStillLost =
        activeElement === document.body ||
        (activeElement instanceof HTMLButtonElement &&
          activeElement.dataset.incomingMint === recovery.removedKey);
      if (focusIsStillLost) {
        const nextButton = recovery.nextKey
          ? buttonRefs.current.get(recovery.nextKey)
          : undefined;
        if (nextButton && !nextButton.disabled) nextButton.focus();
        else
          containerRef.current?.parentElement
            ?.querySelector<HTMLElement>('[aria-label="Exchange"]')
            ?.focus();
      }
      lastFocusedKeyRef.current = null;
      focusRecoveryRef.current = null;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [busy, presence]);

  const hasVisibleRows = renderedTransfers.some((item) => !item.exiting);

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
          {renderedTransfers.length > 0 ? (
            <Card
              role="region"
              aria-label="Incoming transfers"
              className="gap-0 overflow-hidden py-0"
            >
              <CardContent className="p-0">
                {renderedTransfers.map((item, index) => {
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
                          setPresence((current) => ({
                            ...current,
                            rendered: current.rendered.filter(
                              (candidate) =>
                                keyOf(candidate.asset) !== key ||
                                !candidate.exiting,
                            ),
                          }));
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
