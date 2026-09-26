export type Confidence = "low" | "medium" | "high";

export type SourcedValue<T> = {
  value: T | null;
  source: string;
  fetchedAt: string;
  isStale: boolean;
  confidence: Confidence;
  /** Link to the primary source when one exists. */
  sourceUrl?: string;
  /** Why the value is missing (the UI shows "no data", never zero). */
  error?: string;
  /** Marks estimates (e.g. price impact) so the UI labels them explicitly. */
  approximate?: boolean;
};

export function sourced<T>(
  value: T | null | undefined,
  source: string,
  opts: Partial<Omit<SourcedValue<T>, "value" | "source">> = {},
): SourcedValue<T> {
  return {
    value: value === undefined ? null : value,
    source,
    fetchedAt: opts.fetchedAt ?? new Date().toISOString(),
    isStale: opts.isStale ?? false,
    confidence: opts.confidence ?? "high",
    ...(opts.sourceUrl ? { sourceUrl: opts.sourceUrl } : {}),
    ...(opts.error ? { error: opts.error } : {}),
    ...(opts.approximate ? { approximate: true } : {}),
  };
}

export function unavailable<T>(source: string, error: string): SourcedValue<T> {
  return {
    value: null,
    source,
    fetchedAt: new Date().toISOString(),
    isStale: false,
    confidence: "low",
    error,
  };
}

export function hasValue<T>(
  v: SourcedValue<T> | undefined | null,
): v is SourcedValue<T> & { value: T } {
  return !!v && v.value !== null && v.value !== undefined;
}

/** Re-labels a cached value as stale (last known good data). */
export function markStale<T>(v: SourcedValue<T>): SourcedValue<T> {
  return { ...v, isStale: true };
}

const ORDER: Confidence[] = ["low", "medium", "high"];

export function minConfidence(...values: Confidence[]): Confidence {
  let min = 2;
  for (const c of values) min = Math.min(min, ORDER.indexOf(c));
  return ORDER[min] ?? "low";
}
