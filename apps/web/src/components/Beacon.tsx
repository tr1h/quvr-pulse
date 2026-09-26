"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

type Event = "share_x" | "copy_post" | "watch" | "trade_out";

let firstView = true;

function send(body: Record<string, string>) {
  try {
    const data = JSON.stringify(body);
    if (!navigator.sendBeacon?.("/api/hit", new Blob([data], { type: "application/json" })))
      void fetch("/api/hit", { method: "POST", body: data, keepalive: true }).catch(
        () => undefined,
      );
  } catch {
    // statistics must never break the page
  }
}

/** Counts a page view on every navigation (first-party, no cookies, no third parties). */
export function Beacon() {
  const pathname = usePathname();
  useEffect(() => {
    // The external referrer belongs to the first view only; later in-app navigations keep it too.
    send({ p: pathname, r: firstView ? document.referrer : "" });
    firstView = false;
  }, [pathname]);
  return null;
}

export function trackEvent(e: Event) {
  send({ p: location.pathname, e });
}
