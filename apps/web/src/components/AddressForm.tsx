"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const RE = /^0x[0-9a-fA-F]{40}$/;
// Solana mints are base58, 32–44 chars (pump.fun ones end with "pump").
const SOLANA = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function AddressForm({
  placeholder,
  cta,
  invalid,
  solana,
  large = true,
}: {
  placeholder: string;
  cta: string;
  invalid: string;
  solana?: string;
  large?: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = value.trim();
    const isEvm = RE.test(v);
    if (!isEvm && !SOLANA.test(v)) {
      setError(solana && /pump$/i.test(v) ? solana : invalid);
      return;
    }
    setError(null);
    setBusy(true);
    // Solana base58 is case-sensitive: only EVM addresses are lowercased.
    router.push(`/token/${isEvm ? v.toLowerCase() : v}`);
  };

  return (
    <form onSubmit={submit} className="w-full" noValidate>
      <div className={`flex flex-col gap-2 sm:flex-row ${large ? "" : ""}`}>
        <label htmlFor="addr" className="sr-only">
          {placeholder}
        </label>
        <input
          id="addr"
          name="address"
          data-testid="address-input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          inputMode="text"
          maxLength={64}
          aria-invalid={!!error}
          aria-describedby={error ? "addr-err" : undefined}
          className={`num w-full rounded border border-rule bg-ink/70 px-4 text-paper placeholder:text-dim focus:border-signal ${large ? "h-14 text-base sm:text-lg" : "h-10 text-sm"}`}
        />
        <button
          type="submit"
          data-testid="scan-button"
          disabled={busy}
          className={`shrink-0 rounded bg-signal px-6 font-display font-bold text-ink transition hover:brightness-110 disabled:opacity-60 ${large ? "h-14" : "h-10 text-sm"}`}
        >
          {busy ? "…" : cta}
        </button>
      </div>
      {error && (
        <p id="addr-err" role="alert" className="mt-2 text-sm text-risk-high">
          {error}
        </p>
      )}
    </form>
  );
}
