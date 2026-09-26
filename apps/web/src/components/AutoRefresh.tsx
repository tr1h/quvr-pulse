"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/** Re-renders the server component periodically (data comes from the SWR cache). */
export function AutoRefresh({
  seconds,
  label,
  defaultOn = true,
}: {
  seconds: number;
  label: string;
  defaultOn?: boolean;
}) {
  const router = useRouter();
  const [on, setOn] = useState(defaultOn);
  useEffect(() => {
    if (!on) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    return () => clearInterval(id);
  }, [on, seconds, router]);
  return (
    <label className="flex cursor-pointer items-center gap-2 text-xs text-muted">
      <input
        type="checkbox"
        checked={on}
        onChange={(e) => setOn(e.target.checked)}
        className="accent-[var(--color-signal)]"
      />
      <span className={on ? "text-paper" : ""}>
        {label} {seconds}s
      </span>
      {on && <span className="blink h-1.5 w-1.5 rounded-full bg-signal" aria-hidden="true" />}
    </label>
  );
}
