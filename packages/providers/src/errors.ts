export type ProviderErrorKind =
  | "timeout"
  | "http"
  | "blocked"
  | "rate-limited"
  | "circuit-open"
  | "invalid-response"
  | "not-found"
  | "unauthorized"
  | "payment-required"
  | "disabled"
  | "rpc"
  | "ssrf";

export class ProviderError extends Error {
  readonly source: string;
  readonly kind: ProviderErrorKind;
  readonly status?: number;
  readonly retryable: boolean;

  constructor(
    source: string,
    kind: ProviderErrorKind,
    message: string,
    opts: { status?: number; retryable?: boolean } = {},
  ) {
    super(`[${source}] ${message}`);
    this.name = "ProviderError";
    this.source = source;
    this.kind = kind;
    this.status = opts.status;
    this.retryable =
      opts.retryable ??
      (kind === "timeout" ||
        kind === "rate-limited" ||
        (kind === "http" && (opts.status === undefined || opts.status >= 500)));
  }
}

/** eth_call revert — a normal, informative outcome, not a provider failure. */
export class CallRevertedError extends Error {
  readonly data: string | null;
  constructor(message: string, data: string | null) {
    super(message);
    this.name = "CallRevertedError";
    this.data = data;
  }
}

export function describeError(e: unknown): string {
  if (e instanceof ProviderError) return `${e.kind}${e.status ? ` ${e.status}` : ""}: ${e.message}`;
  if (e instanceof Error) return e.message;
  return String(e);
}
