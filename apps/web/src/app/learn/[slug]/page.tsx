import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AddressForm } from "@/components/AddressForm";
import { JsonLd } from "@/components/JsonLd";
import { TERMS, termBySlug } from "@/lib/glossary";
import { makeT, tx } from "@/lib/i18n";
import { localizedPath, pageMetadata, siteUrl } from "@/lib/seo";
import { getLocale } from "@/lib/server";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const term = termBySlug((await params).slug);
  if (!term) return {};
  const locale = await getLocale();
  return pageMetadata({
    path: `/learn/${term.slug}`,
    locale,
    title: term.title[locale],
    description: term.description[locale],
  });
}

export default async function TermPage({ params }: Props) {
  const term = termBySlug((await params).slug);
  if (!term) notFound();
  const locale = await getLocale();
  const t = makeT(locale);
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const base = siteUrl();
  const url = `${base}${localizedPath(`/learn/${term.slug}`, locale)}`;
  const learnLabel = tx(locale, {
    ru: "Словарь",
    en: "Learn",
    de: "Lexikon",
    es: "Glosario",
    zh: "术语",
  });

  const ld = [
    {
      "@context": "https://schema.org",
      "@type": "DefinedTerm",
      name: term.h1[locale],
      description: term.short[locale],
      url,
      inDefinedTermSet: `${base}${localizedPath("/learn", locale)}`,
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: term.faq.map((f) => ({
        "@type": "Question",
        name: f.q[locale],
        acceptedAnswer: { "@type": "Answer", text: f.a[locale] },
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
          name: learnLabel,
          item: `${base}${localizedPath("/learn", locale)}`,
        },
        { "@type": "ListItem", position: 3, name: term.h1[locale], item: url },
      ],
    },
  ];

  return (
    <article className="mx-auto max-w-3xl space-y-7" data-testid="learn-term">
      <JsonLd data={ld} nonce={nonce} />
      <header className="rise space-y-3 pt-4">
        <nav className="label" aria-label="breadcrumbs">
          <Link href="/" className="hover:text-signal">
            QUVR Pulse
          </Link>{" "}
          /{" "}
          <Link href="/learn" className="hover:text-signal">
            {learnLabel}
          </Link>
        </nav>
        <h1 className="font-display text-3xl font-bold leading-tight sm:text-4xl">
          {term.h1[locale]}
        </h1>
        <p className="panel border-l-4 border-l-signal p-4 text-lg leading-relaxed">
          {term.short[locale]}
        </p>
      </header>

      {term.sections.map((s, i) => (
        <section key={i} className="space-y-2">
          <h2 className="font-display text-xl font-medium">{s.h[locale]}</h2>
          <p className="leading-relaxed text-paper/90">{s.p[locale]}</p>
        </section>
      ))}

      <section className="panel space-y-3 p-4">
        <h2 className="font-display text-lg font-medium">
          {tx(locale, {
            ru: "Как QUVR Pulse это проверяет",
            en: "How QUVR Pulse checks it",
            de: "Wie QUVR Pulse das prüft",
            es: "Cómo lo comprueba QUVR Pulse",
            zh: "QUVR Pulse 如何检查",
          })}
        </h2>
        <p className="text-sm leading-relaxed text-muted">{term.check[locale]}</p>
        <AddressForm
          placeholder={t("inputPlaceholder")}
          cta={t("scan")}
          invalid={t("invalidAddress")}
          solana={t("solanaNotSupported")}
          large={false}
        />
      </section>

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
        {term.faq.map((f, i) => (
          <details key={i} className="panel p-3" open>
            <summary className="cursor-pointer font-medium">{f.q[locale]}</summary>
            <p className="mt-2 text-sm leading-relaxed text-muted">{f.a[locale]}</p>
          </details>
        ))}
      </section>

      <nav className="border-t border-rule pt-4" aria-label="learn">
        <div className="label mb-2">{learnLabel}</div>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {TERMS.filter((x) => x.slug !== term.slug).map((x) => (
            <li key={x.slug}>
              <Link
                href={`/learn/${x.slug}`}
                className="text-muted underline decoration-dotted hover:text-signal"
              >
                {x.h1[locale]}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </article>
  );
}
