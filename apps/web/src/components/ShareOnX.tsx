import { CopyButton } from "@/components/CopyButton";
import { TrackedLink } from "@/components/TrackedLink";

/**
 * "Post on X" opens X's own compose window with the prepared text (a plain link, no API call);
 * "Copy" is for pasting the same text as a reply under someone else's post.
 */
export function ShareOnX({
  text,
  labels,
}: {
  text: string;
  labels: { share: string; copy: string; copied: string };
}) {
  const intent = `https://x.com/intent/post?text=${encodeURIComponent(text)}`;
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="share-x">
      <TrackedLink
        event="share_x"
        href={intent}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 rounded border border-paper/70 px-3 py-1.5 text-sm font-medium text-paper hover:border-signal hover:text-signal"
        data-testid="share-x-link"
      >
        <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="currentColor">
          <path d="M18.9 2H22l-6.8 7.8L23 22h-6.2l-4.8-6.3L6.4 22H3.3l7.3-8.3L1 2h6.3l4.4 5.8L18.9 2Zm-1.1 18h1.7L6.3 3.9H4.5L17.8 20Z" />
        </svg>
        {labels.share}
      </TrackedLink>
      <CopyButton value={text} label={labels.copy} done={labels.copied} event="copy_post" />
    </div>
  );
}
