"use client";

import { useState } from "react";
import { trackEvent } from "@/components/Beacon";

/** Talks only to our own /api/watchlist route (never to external APIs). */
export function WatchButton({
  address,
  initial,
  labels,
}: {
  address: string;
  initial: boolean;
  labels: { watch: string; unwatch: string; failed: string };
}) {
  const [watched, setWatched] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const toggle = async () => {
    setBusy(true);
    setError(false);
    try {
      const res = await fetch("/api/watchlist", {
        method: watched ? "DELETE" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address }),
      });
      if (!res.ok) throw new Error(String(res.status));
      if (!watched) trackEvent("watch");
      setWatched(!watched);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        data-testid="watch-button"
        className={`rounded border px-4 py-2 font-display text-sm font-medium transition disabled:opacity-60 ${
          watched
            ? "border-signal bg-signal/10 text-signal"
            : "border-paper/30 text-paper hover:border-signal hover:text-signal"
        }`}
      >
        {watched ? `◉ ${labels.unwatch}` : `○ ${labels.watch}`}
      </button>
      {error && <span className="text-xs text-risk-high">{labels.failed}</span>}
    </div>
  );
}
