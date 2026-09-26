"use client";

import { trackEvent } from "@/components/Beacon";

/** External link that records a first-party event when clicked (e.g. "Post on X"). */
export function TrackedLink({
  event,
  ...props
}: React.AnchorHTMLAttributes<HTMLAnchorElement> & { event: "share_x" | "trade_out" }) {
  return <a {...props} onClick={() => trackEvent(event)} />;
}
