/**
 * Token metadata (name, symbol, descriptions, links) is attacker-controlled.
 * It is never rendered as HTML; these helpers additionally strip control characters,
 * bidi overrides and markup-looking fragments, and bound the length.
 */
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/g;
const BIDI = /[\u202a-\u202e\u2066-\u2069\u200e\u200f\u061c]/g;
const ZERO_WIDTH = /[\u200b-\u200d\u2060\ufeff]/g;

export function sanitizeText(input: unknown, maxLength = 80): string | null {
  if (typeof input !== "string") return null;
  let s = input.normalize("NFKC").replace(CONTROL, " ").replace(BIDI, "").replace(ZERO_WIDTH, "");
  s = s.replace(/<[^>]*>?/g, "").replace(/[<>]/g, "");
  s = s.replace(/\s+/g, " ").trim();
  if (!s) return null;
  return s.length > maxLength ? `${s.slice(0, maxLength - 1)}…` : s;
}

/** Only absolute http(s) URLs without embedded credentials; returns normalized href or null. */
export function safeExternalUrl(input: unknown): string | null {
  if (typeof input !== "string" || input.length > 2048) return null;
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password) return null;
  return url.toString();
}

/** Escapes text for Telegram HTML parse mode. */
export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
