"use client";

import { useState } from "react";
import { trackEvent } from "@/components/Beacon";

export function CopyButton({
  value,
  label,
  done,
  event,
}: {
  value: string;
  label: string;
  done: string;
  event?: "copy_post";
}) {
  const [ok, setOk] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setOk(true);
          if (event) trackEvent(event);
          setTimeout(() => setOk(false), 1500);
        } catch {
          /* clipboard unavailable */
        }
      }}
      className="rounded border border-rule px-2 py-0.5 font-mono text-xs text-muted hover:border-signal hover:text-paper"
    >
      {ok ? done : label}
    </button>
  );
}
