import type { MetadataRoute } from "next";
import { sitemapTokens } from "@quvr/services";
import { TERMS } from "@/lib/glossary";
import { LANDINGS } from "@/lib/landing";
import { hreflangs, siteUrl } from "@/lib/seo";

export const dynamic = "force-dynamic";
export const revalidate = 3600;

function entry(
  path: string,
  lastModified: Date,
  changeFrequency: "hourly" | "daily" | "weekly",
  priority: number,
): MetadataRoute.Sitemap[number] {
  const base = siteUrl();
  return {
    url: `${base}${path}`,
    lastModified,
    changeFrequency,
    priority,
    alternates: { languages: hreflangs(path) },
  };
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const tokens = await sitemapTokens();
  return [
    entry("/", now, "hourly", 1),
    entry("/radar", now, "hourly", 0.8),
    entry("/rug-report", now, "daily", 0.9),
    entry("/track-record", now, "daily", 0.8),
    entry("/about", now, "weekly", 0.7),
    entry("/oracle", now, "daily", 0.7),
    entry("/learn", now, "weekly", 0.8),
    ...TERMS.map((t) => entry(`/learn/${t.slug}`, now, "weekly", 0.8)),
    ...LANDINGS.map((l) => entry(`/${l.slug}`, now, "weekly", 0.9)),
    ...tokens.map((t) => entry(`/token/${t.address}`, t.at, "hourly", 0.6)),
  ];
}
