import type { Metadata } from "next";
import Link from "next/link";
import { TERMS } from "@/lib/glossary";
import { tx } from "@/lib/i18n";
import { pageMetadata } from "@/lib/seo";
import { getLocale } from "@/lib/server";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return pageMetadata({
    path: "/learn",
    locale,
    title: tx(locale, {
      ru: "Словарь рисков мемкоинов: mint, freeze, honeypot, rug pull",
      en: "Memecoin risk glossary: mint, freeze, honeypot, rug pull",
      de: "Memecoin-Risikolexikon: Mint, Freeze, Honeypot, Rug Pull",
      es: "Glosario de riesgos de memecoins: mint, freeze, honeypot, rug pull",
      zh: "Memecoin 风险术语：增发、冻结、貔貅盘、跑路",
    }),
    description: tx(locale, {
      ru: "Простые объяснения терминов из отчётов о токенах: права контракта, ликвидность, держатели, связанные кошельки. Что они значат и как их проверить.",
      en: "Plain explanations of the terms in token reports: contract powers, liquidity, holders, related wallets. What they mean and how to check them.",
      de: "Einfache Erklärungen der Begriffe aus Token-Berichten: Contract-Rechte, Liquidität, Holder, verbundene Wallets. Was sie bedeuten und wie man sie prüft.",
      es: "Explicaciones sencillas de los términos de los informes de tokens: poderes del contrato, liquidez, holders, wallets vinculadas. Qué significan y cómo comprobarlos.",
      zh: "用通俗语言解释代币报告中的术语：合约权限、流动性、持有人、关联钱包。它们的含义以及如何检查。",
    }),
  });
}

export default async function LearnIndex() {
  const locale = await getLocale();
  return (
    <div className="mx-auto max-w-4xl space-y-6" data-testid="learn-index">
      <header className="rise space-y-3 pt-4">
        <h1 className="font-display text-3xl font-bold sm:text-4xl">
          {tx(locale, { ru: "Словарь", en: "Learn", de: "Lexikon", es: "Glosario", zh: "术语" })}
        </h1>
        <p className="max-w-2xl text-muted sm:text-lg">
          {tx(locale, {
            ru: "Что значат термины из отчётов о токенах и почему они важны до покупки.",
            en: "What the terms in token reports mean and why they matter before you buy.",
            de: "Was die Begriffe in Token-Berichten bedeuten und warum sie vor dem Kauf wichtig sind.",
            es: "Qué significan los términos de los informes de tokens y por qué importan antes de comprar.",
            zh: "代币报告中的术语是什么意思，为什么在买入前很重要。",
          })}
        </p>
      </header>
      <ul className="grid gap-3 sm:grid-cols-2">
        {TERMS.map((t) => (
          <li key={t.slug}>
            <Link href={`/learn/${t.slug}`} className="panel block h-full p-4 hover:border-signal">
              <span className="font-display font-medium">{t.h1[locale]}</span>
              <span className="mt-1 block text-sm text-muted">{t.short[locale]}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
