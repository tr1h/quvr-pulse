import { jsonLd } from "@/lib/seo";

/**
 * schema.org structured data. The only raw-HTML exception in the app: the payload is our own
 * server-built object, serialized with "<" escaped, so it cannot close the script tag.
 */
export function JsonLd({ data, nonce }: { data: unknown; nonce?: string }) {
  return (
    <script
      type="application/ld+json"
      nonce={nonce}
      // Browsers hide nonce values from the DOM, so hydration always sees "".
      suppressHydrationWarning
      // eslint-disable-next-line no-restricted-syntax -- escaped, server-built JSON-LD only
      dangerouslySetInnerHTML={{ __html: jsonLd(data) }}
    />
  );
}
