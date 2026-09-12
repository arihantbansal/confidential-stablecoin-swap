import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { OperationResult } from "@/lib/application";
import { transactionUrl } from "@/lib/explorer";

export function TransactionResult({
  result,
  busy,
  onCheck,
  onDismiss,
}: {
  result: OperationResult;
  busy: boolean;
  onCheck: () => void;
  onDismiss: () => void;
}) {
  const unresolved = result.unresolved.length > 0;
  return (
    <section aria-label="Transaction result">
      <Card className="gap-0 py-0 text-sm">
        <CardContent className="space-y-3 p-4">
          <p role="status">{result.message}</p>
          {(
            [
              ["Confirmed", result.confirmed],
              ["Confirmation unknown", result.unresolved],
              ["Failed", result.failed],
            ] as const
          ).flatMap(([label, signatures]) =>
            signatures.map((signature, index) => (
              <div key={signature} className="space-y-1">
                <p className="font-medium">{label}</p>
                <a
                  className="inline-block underline underline-offset-4"
                  href={transactionUrl(signature)}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${label}: view transaction ${index + 1}`}
                >
                  View transaction
                </a>
              </div>
            )),
          )}
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            className="min-h-11"
            onClick={unresolved ? onCheck : onDismiss}
          >
            {unresolved ? "Check status" : "Dismiss result"}
          </Button>
        </CardContent>
      </Card>
    </section>
  );
}
