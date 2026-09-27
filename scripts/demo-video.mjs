// Records the buildathon demo: a scripted walk through quvrpulse.com with on-screen captions and
// a visible cursor. Each scene lasts as long as its voice-over line (manifest from Windows TTS),
// and the start time of every line is written to timeline.json for muxing (scripts/demo-mux.mjs).
//   node scripts/demo-video.mjs C:/rabota/demo
import { chromium } from "@playwright/test";
import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const OUT = path.resolve(process.argv[2] ?? "demo");
const SITE = "https://quvrpulse.com";
// $TRUE on Base: holders come from Blockscout, so the report is complete and stable on camera.
const TOKEN = "0x21cfcfc3d8f98fc728f48341d10ad8283f6eb7ab";
const W = 1280;
const H = 720;
mkdirSync(OUT, { recursive: true });
const VO = Object.fromEntries(
  JSON.parse(readFileSync(path.join(OUT, "vo", "manifest.json"), "utf8")).map((l) => [l.id, l]),
);

const OVERLAY = `
(() => {
  const css = document.createElement("style");
  css.id = "qv-style";
  css.textContent = \`
    #qv-cap{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:2147483646;
      max-width:980px;padding:10px 18px;border-radius:10px;background:rgba(10,11,9,.88);
      border:1px solid rgba(255,176,0,.55);color:#ece6d6;font:500 21px/1.35 system-ui,sans-serif;
      text-align:center;box-shadow:0 6px 30px rgba(0,0,0,.45);transition:opacity .35s}
    #qv-cap b{color:#ffb000}
    #qv-card{position:fixed;inset:0;z-index:2147483647;display:flex;flex-direction:column;
      align-items:center;justify-content:center;gap:18px;background:#0e0f0d;color:#ece6d6;
      font:700 54px/1.15 system-ui,sans-serif;text-align:center;transition:opacity .5s}
    #qv-card small{font:500 26px/1.4 system-ui,sans-serif;color:#9a9585}
    #qv-card em{font-style:normal;color:#ffb000}
    #qv-cur{position:fixed;z-index:2147483645;width:18px;height:18px;margin:-9px 0 0 -9px;
      border-radius:50%;background:rgba(255,176,0,.9);box-shadow:0 0 0 4px rgba(255,176,0,.25);
      pointer-events:none}\`;
  const cur = document.createElement("div");
  cur.id = "qv-cur";
  document.addEventListener("mousemove", (e) => {
    cur.style.left = e.clientX + "px";
    cur.style.top = e.clientY + "px";
  }, true);
  const ensure = () => {
    if (!document.getElementById("qv-style")) (document.head || document.documentElement).appendChild(css);
    if (document.body && !document.getElementById("qv-cur")) document.body.appendChild(cur);
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ensure); else ensure();
  window.__cap = (html) => {
    ensure();
    let el = document.getElementById("qv-cap");
    if (!html) { if (el) el.style.opacity = "0"; return; }
    if (!el) { el = document.createElement("div"); el.id = "qv-cap"; document.body.appendChild(el); }
    el.innerHTML = html; el.style.opacity = "1";
  };
  window.__card = (html) => {
    ensure();
    let el = document.getElementById("qv-card");
    if (!html) { if (el) { el.style.opacity = "0"; setTimeout(() => el.remove(), 600); } return; }
    if (!el) { el = document.createElement("div"); el.id = "qv-card"; document.body.appendChild(el); }
    el.innerHTML = html; el.style.opacity = "1";
  };
})();`;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Waits until the token's full report is built, so the video shows the real verdict. */
async function warmUp() {
  for (let i = 0; i < 80; i++) {
    const r = await fetch(`${SITE}/api/scan/${TOKEN}`).then((x) => x.json()).catch(() => null);
    const rep = r?.report;
    const h = rep?.distribution?.holdersCount;
    const dist = rep?.scores?.distributionHealth?.level;
    const fresh = r?.servedFrom === "fresh" || r?.servedFrom === "cache";
    if (h && !(h.error ?? "").includes("loading") && dist && dist !== "insufficient" && fresh) return;
    await wait(15_000);
  }
  throw new Error("report did not finish building");
}

async function main() {
  await warmUp();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: W, height: H },
    locale: "en-US",
    recordVideo: { dir: OUT, size: { width: W, height: H } },
  });
  await context.addInitScript(OVERLAY);
  // Our own recording must not show up in the site's visitor stats.
  await context.route("**/api/hit**", (r) => r.fulfill({ status: 204, body: "" }));
  const page = await context.newPage();
  const t0 = Date.now(); // the video starts with the page
  const timeline = [];

  const cap = (html) => page.evaluate((h) => window.__cap(h), html);
  const card = (html) => page.evaluate((h) => window.__card(h), html);
  /** Shows a caption (or keeps the card) and lasts as long as the voice-over line. */
  const say = async (id, html) => {
    if (html !== undefined) await cap(html);
    timeline.push({ id, atMs: Date.now() - t0 });
    await wait(VO[id].ms + 450);
  };
  const scroll = async (px, ms = 2500) => {
    const steps = Math.max(1, Math.round(ms / 40));
    for (let i = 0; i < steps; i++) {
      await page.mouse.wheel(0, px / steps);
      await wait(40);
    }
  };
  const glide = async (x, y) => page.mouse.move(x, y, { steps: 25 });
  const center = async (loc) => {
    if (await loc.count()) {
      await loc.first().evaluate((el) => el.scrollIntoView({ behavior: "smooth", block: "center" }));
      await wait(800);
    }
  };

  // 1. Title.
  await page.setContent("<html><body style='margin:0;background:#0e0f0d'></body></html>");
  await card(
    `<div>QUVR <em>Pulse</em></div><small>A risk oracle for Robinhood Chain memecoins<br>with a provable, on-chain track record</small>`,
  );
  await say("title");
  await page.goto(`${SITE}/?lang=en`, { waitUntil: "networkidle" });
  await card(null);
  await wait(500);

  // 2. Problem + pitch.
  await glide(640, 300);
  await say("problem", `About <b>1,000 new tokens</b> launch on Robinhood Chain every day — many vanish within hours.`);
  await say("pitch", `QUVR Pulse checks any token on <b>Robinhood Chain, Base and Solana</b> in seconds, before you buy.`);

  // 3. Check a token.
  const input = page.locator("input").first();
  const box = await input.boundingBox();
  if (box) await glide(box.x + 60, box.y + box.height / 2);
  await input.click();
  await Promise.all([say("paste", `Let's paste a token on Base…`), input.pressSequentially(TOKEN, { delay: 30 })]);
  await input.press("Enter");
  await page.waitForURL(/\/token\//, { timeout: 60_000 });
  await page.waitForSelector('[data-testid="token-report"]', { timeout: 60_000 });
  await wait(1200);
  await say(
    "verdict",
    `A verdict with the reasons behind it: <b>the owner can still mint new tokens, and the top 10 wallets hold 65% of the supply.</b>`,
  );

  // 5. Report details.
  await Promise.all([
    say("sources", `Every number has a source and a time. Contract powers, sell simulation, liquidity depth, holders.`),
    scroll(900, 4500),
  ]);
  await Promise.all([
    say("nodata", `Missing data says <b>"No data"</b> — never a fake zero. And we never call a token "safe".`),
    scroll(1200, 4500),
  ]);

  // 6. Track record.
  await page.goto(`${SITE}/track-record?chain=robinhood&lang=en`, { waitUntil: "networkidle" });
  await wait(800);
  const hi = page.locator('[data-testid="tr-high"]');
  if (await hi.count()) {
    const h = await hi.boundingBox();
    if (h) await glide(h.x + 40, h.y + 30);
  }
  await say("grade", `Scores are cheap, so we grade ourselves. Labels are recorded <b>before</b> the outcome.`);
  await say(
    "result",
    `Of Robinhood Chain tokens we labelled High risk, <b>~80% were gone or down 90% within 24 hours.</b>`,
  );

  // 7. Oracle + hook.
  await page.goto(`${SITE}/oracle?lang=en`, { waitUntil: "networkidle" });
  await wait(800);
  await say("oracle", `<b>QUVR Risk Oracle</b> — labels on Robinhood Chain that any wallet, bot or contract can read.`);
  await center(page.locator("#or-log"));
  await say(
    "badge",
    `For Robinhood Chain tokens every label is <b>written on-chain</b>. When a token was first labelled High can never be changed.`,
  );
  await center(page.locator("#or-addr"));
  await say("verified", `Contracts are verified on Sourcify. Every write links to its transaction.`);
  await center(page.locator("#or-hook"));
  await Promise.all([
    say(
      "hook",
      `Our <b>Uniswap v4 hook</b>: buying a High-risk token needs an explicit "I understand the risk". <b>Selling is never blocked.</b>`,
    ),
    wait(10),
  ]);
  await center(page.locator("#or-dev"));
  await Promise.all([
    say("integrate", `One call to integrate: <b>isHighRisk(token, maxAge)</b>.`),
    wait(10),
  ]);

  // 8. Code.
  await page.goto("https://github.com/tr1h/quvr-pulse/blob/main/README.md", {
    waitUntil: "domcontentloaded",
  });
  await wait(2000);
  await center(page.locator("article table"));
  await Promise.all([
    say(
      "code",
      `Open source. 33 contract tests — including the hook on Uniswap v4's real PoolManager and a mainnet fork.`,
    ),
    (async () => {
      await wait(4000);
      await scroll(500, 3000);
    })(),
  ]);

  // 9. Outro.
  await card(`<div>Check before you buy.</div><small><em>quvrpulse.com</em> · @quvrpulse · github.com/tr1h/quvr-pulse</small>`);
  await say("outro");
  await wait(800);

  const video = page.video();
  await context.close();
  await browser.close();
  const dest = path.join(OUT, "quvr-pulse-demo-silent.webm");
  renameSync(await video.path(), dest);
  writeFileSync(path.join(OUT, "timeline.json"), JSON.stringify(timeline, null, 1));
  console.log("saved", dest, `${(statSync(dest).size / 1e6).toFixed(1)} MB`, "lines", timeline.length);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
