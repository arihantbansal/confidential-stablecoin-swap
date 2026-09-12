import type { Ref } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ExchangeRecipientFieldProps {
  id: string;
  errorId: string;
  value: string;
  error: string | null;
  busy: boolean;
  inputRef: Ref<HTMLInputElement>;
  onChange: (value: string) => void;
}

export function ExchangeRecipientField({
  id,
  errorId,
  value,
  error,
  busy,
  inputRef,
  onChange,
}: ExchangeRecipientFieldProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-sm text-muted-foreground">
        To
      </Label>
      <Input
        ref={inputRef}
        id={id}
        autoComplete="off"
        spellCheck={false}
        placeholder="Recipient address"
        value={value}
        disabled={busy}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className="min-h-11 font-mono text-base md:text-sm"
      />
      {error ? (
        <p id={errorId} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
