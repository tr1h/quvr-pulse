import { X_URL } from "@/lib/seo";

/** "Follow on X" button: every page links to @quvrpulse, growing the audience we post to. */
export function FollowX({ label, compact = false }: { label: string; compact?: boolean }) {
  return (
    <a
      href={X_URL}
      target="_blank"
      rel="me noopener noreferrer"
      className={`inline-flex items-center gap-1.5 rounded border border-signal/70 text-signal hover:bg-signal hover:text-ink ${compact ? "px-2 py-1 text-xs" : "px-3 py-1.5 text-sm font-medium"}`}
      data-testid="follow-x"
    >
      <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true" fill="currentColor">
        <path d="M18.9 2H22l-6.8 7.8L23 22h-6.2l-4.8-6.3L6.4 22H3.3l7.3-8.3L1 2h6.3l4.4 5.8L18.9 2Zm-1.1 18h1.7L6.3 3.9H4.5L17.8 20Z" />
      </svg>
      <span>{label}</span>
    </a>
  );
}
