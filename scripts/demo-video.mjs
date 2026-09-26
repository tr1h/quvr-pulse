// Records the buildathon demo video: a scripted walk through quvrpulse.com with on-screen
// English captions and a visible cursor. Output: webm in the directory given as argv[2].
//   node scripts/demo-video.mjs C:/rabota/demo
import { chromium } from "@playwright/test";
import { mkdirSync, readdirSync, renameSync, statSync } from "node:fs";
import path from "node:path";

const OUT = path.resolve(process.argv[2] ?? "demo");
const SITE = "https://quvrpulse.com";
const TOKEN = "0xCd75b770bdAAEd8d3a4AC9BCf75a5f2478Eab9CF";
const W = 1280;
const H = 720;
mkdirSync(OUT, { recursive: true });

const OVERLAY = `
(() => {
  const css = document.createElement("style");
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
      pointer-events:none;transition:transform .08s}\`;
  const cur = document.createElement("div");
  cur.id = "qv-cur";
  document.addEventListener("mousemove", (e) => {
    cur.style.left = e.clientX + "px";
    cur.style.top = e.clientY + "px";
  }, true);
  const mount = () => { (document.head || document.documentElement).appendChild(css); document.body.appendChild(cur); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount); else mount();
  window.__cap = (html) => {
    let el = document.getElementById("qv-cap");
    if (!html) { if (el) el.style.opacity = "0"; return; }
    if (!el) { el = document.createElement("div"); el.id = "qv-cap"; document.body.appendChild(el); }
    el.innerHTML = html; el.style.opacity = "1";
  };
  window.__card = (html) => {
    let el = document.getElementById("qv-card");
    if (!html) { if (el) { el.style.opacity = "0"; setTimeout(() => el.remove(), 600); } return; }
    if (!el) { el = document.createElement("div"); el.id = "qv-card"; document.body.appendChild(el); }
    el.innerHTML = html; el.style.opacity = "1";
  };
})();`;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Waits until the token's full report is built (holders history loaded), so the video shows the real verdict. */
async function warmUp() {
  for (let i = 0; i < 30; i++) {
    const r = await fetch(`${SITE}/api/scan/${TOKEN}`).then((x) => x.json()).catch(() => null);
    const h = r?.report?.distribution?.holdersCount;
    if (h && !(h.error ?? "").includes("loading")) return;
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
  const cap = (html) => page.evaluate((h) => window.__cap(h), html);
  const card = (html) => page.evaluate((h) => window.__card(h), html);
  const scroll = async (px, ms = 2500) => {
    const steps = Math.max(1, Math.round(ms / 40));
    for (let i = 0; i < steps; i++) {
      await page.mouse.wheel(0, px / steps);
      await wait(40);
    }
  };
  const glide = async (x, y) => page.mouse.move(x, y, { steps: 25 });

  // 1. Title card from the first frame, then the home page underneath.
  await page.setContent("<html><body style='margin:0;background:#0e0f0d'></body></html>");
  await page.evaluate(() => {});
  await card(`<div>QUVR <em>Pulse</em></div><small>A risk oracle for Robinhood Chain memecoins<br>with a provable, on-chain track record</small>`);
  await wait(3500);
  await page.goto(`${SITE}/?lang=en`, { waitUntil: "networkidle" });
  await card(`<div>QUVR <em>Pulse</em></div><small>A risk oracle for Robinhood Chain memecoins<br>with a provable, on-chain track record</small>`);
  await wait(1500);
  await card(null);
  await wait(600);

  // 2. The problem.
  await glide(640, 300);
  await cap(`About <b>1,000 new tokens</b> launch on Robinhood Chain every day — many vanish within hours.`);
  await wait(4500);
  await cap(`QUVR Pulse checks any token in seconds, before you buy.`);
  await wait(3500);

  // 3. Check a token: type the address.
  const input = page.locator("input").first();
  const box = await input.boundingBox();
  if (box) await glide(box.x + 60, box.y + box.height / 2);
  await input.click();
  await cap(`Paste a token address…`);
  await input.pressSequentially(TOKEN, { delay: 35 });
  await wait(600);
  await input.press("Enter");
  await page.waitForURL(/\/token\//, { timeout: 60_000 });
  await page.waitForSelector('[data-testid="token-report"]', { timeout: 60_000 });
  await wait(2500);
  await cap(`A verdict with the reasons behind it: <b>top holders own most of the supply, the creator holds a big share — and is selling.</b>`);
  await wait(6000);

  // 4. On-chain badge.
  const badge = page.locator('[data-testid="onchain-badge"]');
  if (await badge.count()) {
    await badge.evaluate((el) => el.scrollIntoView({ behavior: "smooth", block: "center" }));
    await wait(900);
    const b = await badge.boundingBox();
    if (b) await glide(b.x + 200, b.y + 20);
    await cap(`The label is <b>recorded on Robinhood Chain</b>. When a token was first labelled High can never be changed.`);
    await wait(6000);
  }

  // 5. Walk through the report.
  await cap(`Every number has a source and a time. Contract powers, sell simulation, liquidity depth, holders.`);
  await scroll(900, 4000);
  await wait(1500);
  await cap(`Missing data says <b>"No data"</b> — never a fake zero. And we never call a token "safe".`);
  await scroll(1200, 4500);
  await wait(2000);

  // 6. Track record.
  await page.goto(`${SITE}/track-record?chain=robinhood&lang=en`, { waitUntil: "networkidle" });
  await wait(1200);
  const hi = page.locator('[data-testid="tr-high"]');
  if (await hi.count()) {
    const b = await hi.boundingBox();
    if (b) await glide(b.x + 40, b.y + 30);
  }
  await cap(`Scores are cheap, so we grade ourselves. Labels are recorded <b>before</b> the outcome.`);
  await wait(5000);
  await cap(`Of Robinhood Chain tokens we labelled High risk, <b>~80% were gone or down 90% within 24 hours.</b>`);
  await wait(6000);
  await scroll(500, 2500);
  await wait(1500);

  // 7. Oracle + hook.
  await page.goto(`${SITE}/oracle?lang=en`, { waitUntil: "networkidle" });
  await wait(1200);
  await cap(`<b>QUVR Risk Oracle</b> — labels on Robinhood Chain that any wallet, bot or contract can read.`);
  await wait(5000);
  await scroll(650, 3000);
  await cap(`Contracts are verified on Sourcify. Every write links to its transaction.`);
  await wait(4500);
  await scroll(700, 3000);
  await cap(`Our <b>Uniswap v4 hook</b>: buying a High-risk token needs an explicit "I understand the risk". <b>Selling is never blocked.</b>`);
  await wait(7000);
  await scroll(600, 2500);
  await cap(`One call to integrate: <b>isHighRisk(token, maxAge)</b>.`);
  await wait(4000);

  // 8. Code.
  await page.goto("https://github.com/tr1h/quvr-pulse/blob/main/README.md", { waitUntil: "domcontentloaded" });
  await wait(2500);
  const table = page.locator("article table").first();
  if (await table.count()) await table.evaluate((el) => el.scrollIntoView({ behavior: "smooth", block: "center" }));
  await wait(1500);
  await cap(`Open source. 33 contract tests — including the hook on Uniswap v4's real PoolManager and a mainnet fork.`);
  await wait(4000);
  await scroll(500, 3000);
  await wait(2000);

  // 9. Outro.
  await card(`<div>Check before you buy.</div><small><em>quvrpulse.com</em> · @quvrpulse · github.com/tr1h/quvr-pulse</small>`);
  await wait(5000);

  const video = page.video();
  await context.close();
  await browser.close();
  const src = await video.path();
  const dest = path.join(OUT, "quvr-pulse-demo.webm");
  renameSync(src, dest);
  console.log("saved", dest, `${(statSync(dest).size / 1e6).toFixed(1)} MB`);
  void readdirSync;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
