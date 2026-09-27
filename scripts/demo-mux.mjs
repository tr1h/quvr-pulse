// Mixes the voice-over into the silent demo video inside Chromium (no ffmpeg needed): the video
// plays through captureStream(), each TTS line starts at its timeline time on a WebAudio clock,
// and MediaRecorder writes picture + sound into one webm.
//   node scripts/demo-mux.mjs C:/rabota/demo
import { chromium } from "@playwright/test";
import { createServer } from "node:http";
import { createReadStream, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const DIR = path.resolve(process.argv[2] ?? "demo");
const OUT = path.join(DIR, "quvr-pulse-demo.webm");
const TYPES = { ".webm": "video/webm", ".wav": "audio/wav", ".json": "application/json" };

const PAGE = `<!doctype html><html><body style="margin:0;background:#000"><script>
window.mux = async () => {
  const [timeline, manifest] = await Promise.all([
    fetch("/timeline.json").then((r) => r.json()),
    fetch("/vo/manifest.json").then((r) => r.json()),
  ]);
  const ctx = new AudioContext();
  const buffers = {};
  for (const l of manifest)
    buffers[l.id] = await ctx.decodeAudioData(await (await fetch("/vo/" + l.id + ".wav")).arrayBuffer());
  const video = document.createElement("video");
  video.src = "/quvr-pulse-demo-silent.webm";
  video.muted = true;
  video.preload = "auto";
  document.body.appendChild(video);
  await new Promise((r) => (video.oncanplaythrough = r));
  const dest = ctx.createMediaStreamDestination();
  const stream = new MediaStream([
    ...video.captureStream(30).getVideoTracks(),
    ...dest.stream.getAudioTracks(),
  ]);
  const rec = new MediaRecorder(stream, {
    mimeType: "video/webm;codecs=vp8,opus",
    videoBitsPerSecond: 6000000,
    audioBitsPerSecond: 128000,
  });
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  await ctx.resume();
  rec.start(1000);
  const lead = 0.3;
  const start = ctx.currentTime + lead;
  for (const t of timeline) {
    const s = ctx.createBufferSource();
    s.buffer = buffers[t.id];
    s.connect(dest);
    s.start(start + t.atMs / 1000);
  }
  setTimeout(() => video.play(), lead * 1000);
  await new Promise((r) => (video.onended = r));
  await new Promise((r) => setTimeout(r, 500));
  rec.stop();
  await new Promise((r) => (rec.onstop = r));
  await fetch("/upload", { method: "POST", body: new Blob(chunks, { type: "video/webm" }) });
  return { seconds: video.duration, chunks: chunks.length };
};
</script></body></html>`;

const server = createServer((req, res) => {
  if (req.method === "POST" && req.url === "/upload") {
    const parts = [];
    req.on("data", (c) => parts.push(c));
    req.on("end", () => {
      writeFileSync(OUT, Buffer.concat(parts));
      res.end("ok");
    });
    return;
  }
  if (req.url === "/") {
    res.setHeader("content-type", "text/html");
    return res.end(PAGE);
  }
  const file = path.join(DIR, decodeURIComponent(req.url.split("?")[0]));
  if (!file.startsWith(DIR)) return res.writeHead(403).end();
  try {
    statSync(file);
  } catch {
    return res.writeHead(404).end();
  }
  res.setHeader("content-type", TYPES[path.extname(file)] ?? "application/octet-stream");
  createReadStream(file).pipe(res);
});

await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;
const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage();
await page.goto(`http://127.0.0.1:${port}/`);
const info = await page.evaluate(() => window.mux());
await browser.close();
server.close();
console.log("muxed", OUT, `${(statSync(OUT).size / 1e6).toFixed(1)} MB`, info);
