import {
  type TransactionFailure,
  TransactionFailureError,
} from "@confidential-stablecoin/runtime/transactions";

function emptyFailure(cause: string): TransactionFailure {
  return {
    confirmedSignatures: [],
    failedSignatures: [],
    unresolvedSignatures: [],
    cause,
  };
}

function isTransactionFailure(value: unknown): value is TransactionFailure {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<TransactionFailure>;
  return (
    typeof candidate.cause === "string" &&
    Array.isArray(candidate.confirmedSignatures) &&
    Array.isArray(candidate.failedSignatures) &&
    Array.isArray(candidate.unresolvedSignatures)
  );
}

function readFailure(error: unknown): TransactionFailure {
  if (error instanceof TransactionFailureError) return error.failure;
  if (isTransactionFailure(error)) return error;
  if (error instanceof Error) return emptyFailure(error.message);
  return emptyFailure(String(error));
}

export function mergeFailure(
  error: unknown,
  confirmed: Iterable<string> = [],
): TransactionFailure {
  const failure = readFailure(error);
  return {
    ...failure,
    confirmedSignatures: Array.from(
      new Set([...confirmed, ...failure.confirmedSignatures]),
    ),
  };
}

export function failureError(
  error: unknown,
  confirmed: Iterable<string> = [],
): TransactionFailureError {
  if (error instanceof TransactionFailureError && ![...confirmed].length) {
    return error;
  }
  return new TransactionFailureError(mergeFailure(error, confirmed));
}
