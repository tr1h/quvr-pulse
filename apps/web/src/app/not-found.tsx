import Link from "next/link";

export default function NotFound() {
  return (
    <div className="panel p-6" data-testid="not-found">
      <h1 className="font-display text-xl font-bold">404</h1>
      <p className="mt-2 text-sm text-muted">
        Страница не найдена или адрес некорректен. / Page not found or invalid address.
      </p>
      <Link href="/" className="mt-4 inline-block text-signal underline">
        ← QUVR Pulse
      </Link>
    </div>
  );
}
