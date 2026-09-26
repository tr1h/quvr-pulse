import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { radarRows } from "@quvr/services";
import { formatUsd, shortAddress, pickText } from "@quvr/shared";
import { AddressForm } from "@/components/AddressForm";
import { JsonLd } from "@/components/JsonLd";
import { LANDINGS, landingBySlug } from "@/lib/landing";
import { makeT, tx } from "@/lib/i18n";
import { localizedPath, pageMetadata, siteUrl } from "@/lib/seo";
import { getLocale } from "@/lib/server";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const l = landingBySlug((await params).slug);
  if (!l) return {};
  const locale = await getLocale();
  return pageMetadata({
    path: `/${l.slug}`,
    locale,
    title: pickText(l.title, locale),
    description: pickText(l.description, locale),
  });
}

export default async function LandingPage({ params }: Props) {
  const l = landingBySlug((await params).slug);
  if (!l) notFound();
  const locale = await getLocale();
  const t = makeT(locale);
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const tokens = l.chain
    ? (await radarRows(60)).filter((r) => r.chain === l.chain).slice(0, 12)
    : (await radarRows(12)).slice(0, 12);
  const base = siteUrl();

  const ld = [
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: l.faq.map((f) => ({
        "@type": "Question",
        name: pickText(f.q, locale),
        acceptedAnswer: { "@type": "Answer", text: pickText(f.a, locale) },
      })),
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "QUVR Pulse",
          item: `${base}${localizedPath("/", locale)}`,
        },
        {
          "@type": "ListItem",
          position: 2,
          name: pickText(l.h1, locale),
          item: `${base}${localizedPath(`/${l.slug}`, locale)}`,
        },
      ],
    },
  ];

  return (
    <article className="mx-auto max-w-3xl space-y-8" data-testid="landing">
      <JsonLd data={ld} nonce={nonce} />
      <header className="rise space-y-4 pt-4">
        <nav className="label" aria-label="breadcrumbs">
          <Link href="/" className="hover:text-signal">
            QUVR Pulse
          </Link>{" "}
          / {pickText(l.h1, locale)}
        </nav>
        <h1 className="font-display text-3xl font-bold leading-tight sm:text-4xl">
          {pickText(l.h1, locale)}
        </h1>
        <p className="text-muted sm:text-lg">{pickText(l.lead, locale)}</p>
        <AddressForm
          placeholder={t("inputPlaceholder")}
          cta={t("scan")}
          invalid={t("invalidAddress")}
          solana={t("solanaNotSupported")}
        />
      </header>

      {l.sections.map((s, i) => (
        <section key={i} className="space-y-3">
          <h2 className="font-display text-xl font-medium">{pickText(s.h, locale)}</h2>
          {s.p.map((p, j) => (
            <p key={j} className="leading-relaxed text-paper/90">
              {pickText(p, locale)}
            </p>
          ))}
        </section>
      ))}

      {tokens.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-display text-xl font-medium">
            {tx(locale, {
              ru: "Недавно проверенные токены",
              en: "Recently checked tokens",
              de: "Kürzlich geprüfte Tokens",
              es: "Tokens revisados recientemente",
              zh: "最近检查的代币",
            })}
          </h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {tokens.map((r) => (
              <li key={r.address}>
                <Link
                  href={`/token/${r.address}`}
                  className="panel flex items-baseline justify-between gap-2 px-3 py-2 hover:border-signal"
                >
                  <span className="truncate">
                    <span className="font-medium">
                      {r.symbol ? `$${r.symbol}` : shortAddress(r.address)}
                    </span>{" "}
                    <span className="text-xs text-dim">{r.name ?? ""}</span>
                  </span>
                  <span className="shrink-0 font-mono text-xs text-muted">
                    {formatUsd(r.marketCapUsd, locale) ?? t("noData")}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="font-display text-xl font-medium">
          {tx(locale, {
            ru: "Частые вопросы",
            en: "FAQ",
            de: "Häufige Fragen",
            es: "Preguntas frecuentes",
            zh: "常见问题",
          })}
        </h2>
        {l.faq.map((f, i) => (
          <details key={i} className="panel p-3" open={i === 0}>
            <summary className="cursor-pointer font-medium">{pickText(f.q, locale)}</summary>
            <p className="mt-2 text-sm leading-relaxed text-muted">{pickText(f.a, locale)}</p>
          </details>
        ))}
      </section>

      <nav className="flex flex-wrap gap-3 border-t border-rule pt-4 text-sm" aria-label="guides">
        {LANDINGS.filter((x) => x.slug !== l.slug).map((x) => (
          <Link
            key={x.slug}
            href={`/${x.slug}`}
            className="text-muted underline decoration-dotted hover:text-signal"
          >
            {pickText(x.h1, locale)}
          </Link>
        ))}
      </nav>
    </article>
  );
}
