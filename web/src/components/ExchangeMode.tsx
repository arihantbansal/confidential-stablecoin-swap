import { ArrowLeftRight, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ExchangeMode({
  mode,
  busy,
  sourceKind,
  targetKind,
  onModeChange,
  onReverse,
}: {
  mode: "convert" | "send";
  busy: boolean;
  sourceKind: string;
  targetKind: string;
  onModeChange: (mode: "convert" | "send") => void;
  onReverse: () => void;
}) {
  return (
    <>
      <fieldset
        aria-label="Action"
        disabled={busy}
        className="relative m-0 grid min-w-0 grid-cols-2 rounded-lg border-0 bg-muted p-1"
      >
        <span
          aria-hidden="true"
          className="seg-thumb absolute inset-y-1 left-1 w-[calc((100%-0.5rem)/2)] rounded-md bg-card shadow-xs"
          style={{ transform: `translateX(${mode === "send" ? 100 : 0}%)` }}
        />
        {(["convert", "send"] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={mode === value}
            disabled={busy}
            onClick={() => onModeChange(value)}
            className="relative z-10 min-h-11 rounded-md text-sm font-medium text-muted-foreground transition-colors duration-150 aria-pressed:text-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
          >
            {value === "convert" ? "Convert" : "Send"}
          </button>
        ))}
      </fieldset>
      {mode === "convert" ? (
        <fieldset
          className="mt-4 flex min-h-11 items-center gap-3 px-1 text-sm"
          aria-label={`Convert from ${sourceKind} to ${targetKind}`}
        >
          <span className="direction-label" key={`from-${sourceKind}`}>
            {sourceKind}
          </span>
          <ArrowRight
            className="size-4 text-muted-foreground"
            aria-hidden="true"
          />
          <span className="direction-label" key={`to-${targetKind}`}>
            {targetKind}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={busy}
            onClick={onReverse}
            aria-label="Reverse conversion direction"
            className="press ml-auto size-11"
          >
            <ArrowLeftRight aria-hidden="true" />
          </Button>
        </fieldset>
      ) : null}
    </>
  );
}
