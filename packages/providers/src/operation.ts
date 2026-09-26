import { AsyncLocalStorage } from "node:async_hooks";

const operations = new AsyncLocalStorage<AbortSignal>();

export function operationSignal(): AbortSignal | undefined {
  return operations.getStore();
}

export function checkOperation() {
  operationSignal()?.throwIfAborted();
}

/** Cancels provider requests and prevents late results from being committed. */
export async function withOperationTimeout<T>(ms: number, fn: () => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const parent = operationSignal();
  const signal = parent ? AbortSignal.any([parent, controller.signal]) : controller.signal;
  const timer = setTimeout(() => controller.abort(new Error("operation deadline exceeded")), ms);
  let onAbort: () => void = () => {};
  try {
    signal.throwIfAborted();
    const cancelled = new Promise<never>((_, reject) => {
      onAbort = () => reject(signal.reason);
      signal.addEventListener("abort", onAbort, { once: true });
    });
    return await Promise.race([operations.run(signal, fn), cancelled]);
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", onAbort);
  }
}
