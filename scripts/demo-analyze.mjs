// Finds when each caption / title card appears in a recorded demo video, so a voice-over can be
// placed on an existing recording. Writes <dir>/segments.json: [{ kind, startMs }].
//   node scripts/demo-analyze.mjs C:/rabota/demo quvr-pulse-demo-silent.webm
import { chromium } from "@playwright/test";
import { createServer } from "node:http";
import { createReadStream, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const DIR = path.resolve(process.argv[2] ?? "demo");
const FILE = process.argv[3] ?? "quvr-pulse-demo-silent.webm";

const server = createServer((req, res) => {
  if (req.url === "/") {
    res.setHeader("content-type", "text/html");
    return res.end("<!doctype html><body style='margin:0'></body>");
  }
  // Range support: the browser needs it to seek inside the video.
  const file = path.join(DIR, FILE);
  const size = statSync(file).size;
  const m = /bytes=(d*)-(d*)/.exec(req.headers.range ?? "");
  if (m) {
    const start = m[1] ? Number(m[1]) : 0;
    const end = m[2] ? Number(m[2]) : size - 1;
    res.writeHead(206, {
      "content-type": "video/webm",
      "accept-ranges": "bytes",
      "content-range": `bytes ${start}-${end}/${size}`,
      "content-length": end - start + 1,
    });
    return createReadStream(file, { start, end }).pipe(res);
  }
  res.writeHead(200, { "content-type": "video/webm", "accept-ranges": "bytes", "content-length": size });
  createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`http://127.0.0.1:${port}/`);
const samples = await page.evaluate(async () => {
  const v = document.createElement("video");
  v.src = "/v.webm";
  v.muted = true;
  document.body.appendChild(v);
  await new Promise((r) => (v.onloadeddata = r));
  // webm from Playwright has no duration header: seek far to learn it.
  v.currentTime = 1e9;
  await new Promise((r) => (v.onseeked = r));
  const dur = v.currentTime;
  const c = document.createElement("canvas");
  c.width = 1280;
  c.height = 720;
  const g = c.getContext("2d", { willReadFrequently: true });
  const out = [];
  for (let t = 0; t < dur; t += 0.2) {
    v.currentTime = t;
    await new Promise((r) => (v.onseeked = r));
    g.drawImage(v, 0, 0, 1280, 720);
    // Caption box region (bottom centre) as a coarse grayscale signature.
    const img = g.getImageData(320, 600, 640, 95).data;
    const sig = [];
    for (let y = 0; y < 95; y += 12)
      for (let x = 0; x < 640; x += 16) {
        const i = (y * 640 + x) * 4;
        sig.push(Math.round((img[i] + img[i + 1] + img[i + 2]) / 3));
      }
    const full = g.getImageData(0, 0, 1280, 720).data;
    let sum = 0;
    for (let i = 0; i < full.length; i += 400) sum += full[i] + full[i + 1] + full[i + 2];
    // Caption box border is amber: count amber-ish pixels along the box edge rows.
    const edge = g.getImageData(320, 590, 640, 110).data;
    let amber = 0;
    for (let i = 0; i < edge.length; i += 4)
      if (edge[i] > 150 && edge[i + 1] > 90 && edge[i + 1] < 190 && edge[i + 2] < 90) amber++;
    out.push({ t, sig, bright: sum / (full.length / 400) / 3, amber });
  }
  return { dur, out };
});
await browser.close();
server.close();

// Title/outro cards: almost uniform dark frames with little detail.
const segs = [];
let prev = null;
for (const s of samples.out) {
  const isCard = s.bright < 30;
  const hasCap = !isCard && s.amber > 40;
  const kind = isCard ? "card" : hasCap ? "caption" : "none";
  const changed =
    !prev ||
    kind !== prev.kind ||
    (kind === "caption" &&
      s.sig.reduce((a, v, i) => a + Math.abs(v - prev.sig[i]), 0) / s.sig.length > 18);
  if (changed && kind !== "none") segs.push({ kind, startMs: Math.round(s.t * 1000) });
  prev = { kind, sig: s.sig };
}
writeFileSync(path.join(DIR, "segments.json"), JSON.stringify({ durationMs: Math.round(samples.dur * 1000), segs }, null, 1));
console.log("duration", samples.dur.toFixed(1), "segments", segs.length);
for (const s of segs) console.log(s.kind.padEnd(8), (s.startMs / 1000).toFixed(1));
