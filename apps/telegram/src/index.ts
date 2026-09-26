/**
 * QUVR Pulse Telegram bot. Read-only: never asks for seed phrases or private keys.
 * Modes: long polling (dev) or webhook (TELEGRAM_MODE=webhook) with secret-token verification.
 */
import { createServer } from "node:http";
import { Bot, webhookCallback, type Context } from "grammy";
import { shareFacts } from "@quvr/scoring";
import {
  addToWatchlist,
  waitForFullReport,
  recordBot,
  cacheGet,
  cacheSet,
  tickerClones,
  getTokenReport,
  listWatchlist,
  rateLimit,
  recordSourceStatus,
  removeFromWatchlist,
  trendingOnFomo,
} from "@quvr/services";
import { extractTokenRef, formatQuickCard, levelLabel } from "./card";
import {
  tokenRefSchema,
  escapeHtml,
  formatSmallPrice,
  formatUsd,
  logger,
  serverEnv,
  shortAddress,
  type ScoreResult,
  type TokenReport,
} from "@quvr/shared";

const log = logger.child({ app: "telegram" });
const env = serverEnv();

const LEVEL_RU: Record<string, string> = {
  low: "низкий обнаруженный риск",
  elevated: "повышенный риск",
  high: "высокий риск",
  insufficient: "недостаточно данных",
  strong: "сильный",
  moderate: "умеренный",
  weak: "слабый",
};
const SCORE_RU: Record<string, string> = {
  contractSafety: "Контракт",
  liquidityHealth: "Ликвидность",
  distributionHealth: "Распределение",
  socialMomentum: "Соц. импульс",
};

const nd = "нет данных";

export function formatScanMessage(r: TokenReport, appUrl: string): string {
  const e = escapeHtml;
  const name = e(r.token.name.value ?? nd);
  const sym = r.token.symbol.value ? ` ($${e(r.token.symbol.value)})` : "";
  const score = (s: ScoreResult) =>
    `${SCORE_RU[s.key]}: <b>${s.value ?? "—"}</b> · ${LEVEL_RU[s.level] ?? s.level}`;
  const risks = r.findings.filter((f) => f.severity !== "info").slice(0, 3);
  const lines = [
    `<b>${name}</b>${sym}`,
    `<code>${e(r.checksumAddress)}</code>`,
    `${e(r.chainName)} · ${e(r.mode)}`,
    "",
    `Цена: ${r.market.priceUsd.value !== null ? e(formatSmallPrice(r.market.priceUsd.value, "ru")) : nd}`,
    `Капитализация: ${e(formatUsd(r.market.marketCapUsd.value, "ru") ?? nd)}`,
    `Ликвидность: ${e(formatUsd(r.market.liquidityUsd.value, "ru") ?? nd)}`,
    "",
    ...(["contractSafety", "liquidityHealth", "distributionHealth", "socialMomentum"] as const).map(
      (k) => score(r.scores[k]),
    ),
    "",
    risks.length
      ? "<b>Главные риски:</b>"
      : "Существенных рисков не обнаружено (это не гарантия безопасности).",
    ...risks.map((f) => `• [${f.severity}] ${e(f.title.ru)}`),
    "",
    `<a href="${e(`${appUrl}/token/${r.address}`)}">Полный отчёт</a>`,
    "<i>Независимая аналитика, не инвестиционная рекомендация.</i>",
  ];
  return lines.join("\n");
}

async function limited(ctx: Context): Promise<boolean> {
  const id = String(ctx.chat?.id ?? "unknown");
  const rl = await rateLimit("tg", id, 12, 60);
  if (!rl.ok) {
    await ctx.reply(`Слишком много запросов. Повторите через ${rl.retryAfterSeconds} с.`);
    return true;
  }
  return false;
}

function parseAddress(text: string | undefined): string | null {
  const arg = (text ?? "").trim().split(/\s+/)[1];
  const r = tokenRefSchema.safeParse(arg ?? "");
  return r.success ? r.data.address : null;
}

export function buildBot(token: string): Bot {
  const bot = new Bot(token);
  const appUrl = env.NEXT_PUBLIC_APP_URL;

  bot.command(["start", "help"], (ctx) =>
    ctx.reply(
      [
        "<b>QUVR Pulse</b> — независимая read-only аналитика токенов Robinhood Chain, Base и Solana.",
        "",
        "/scan 0x… — быстрый отчёт",
        "/watch 0x… — уведомления об изменениях",
        "/unwatch 0x… — отписаться",
        "/trending — тренды Fomo (если подключён источник)",
        "",
        "Бот никогда не запрашивает seed-фразу или приватный ключ и не совершает сделок.",
        'Новости и разборы скамов: <a href="https://x.com/quvrpulse">@quvrpulse в X</a>',
        "QUVR Pulse is an independent analytics product and is not affiliated with or endorsed by Robinhood or Fomo.",
      ].join("\n"),
      { parse_mode: "HTML", link_preview_options: { is_disabled: true } },
    ),
  );

  bot.command("scan", async (ctx) => {
    if (await limited(ctx)) return;
    void recordBot("scan_cmd").catch(() => undefined);
    const address = parseAddress(ctx.message?.text);
    if (!address) return ctx.reply("Укажите адрес токена: /scan 0x… (40 hex-символов)");
    const wait = await ctx.reply("Сканирую контракт, ликвидность и держателей…");
    try {
      const { report } = await getTokenReport(address);
      await ctx.api.editMessageText(
        ctx.chat.id,
        wait.message_id,
        formatScanMessage(report, appUrl),
        { parse_mode: "HTML", link_preview_options: { is_disabled: true } },
      );
    } catch (e) {
      log.warn("scan failed", { error: (e as Error).message });
      await ctx.api.editMessageText(
        ctx.chat.id,
        wait.message_id,
        "Источники данных не ответили. Попробуйте позже — выдуманные значения мы не показываем.",
      );
    }
  });

  bot.command("watch", async (ctx) => {
    if (await limited(ctx)) return;
    const address = parseAddress(ctx.message?.text);
    if (!address) return ctx.reply("Укажите адрес: /watch 0x…");
    const ok = await addToWatchlist("telegram", String(ctx.chat.id), address);
    await ctx.reply(
      ok
        ? `Добавлено в наблюдение: <code>${escapeHtml(shortAddress(address))}</code>\nУведомлю о продажах deployer, падении ликвидности, крупных продажах, изменении привилегий, тезисах качественных авторов и провале симуляции продажи.`
        : "Не удалось: база данных недоступна (запустите docker compose up -d).",
      { parse_mode: "HTML" },
    );
  });

  bot.command("unwatch", async (ctx) => {
    if (await limited(ctx)) return;
    const address = parseAddress(ctx.message?.text);
    if (!address) {
      const list = await listWatchlist("telegram", String(ctx.chat.id));
      return ctx.reply(
        list.length
          ? `Укажите адрес: /unwatch 0x…\nСейчас в наблюдении:\n${list.map((w) => `• ${w.token.symbol ?? w.tokenAddress}`).join("\n")}`
          : "Список наблюдения пуст.",
      );
    }
    const removed = await removeFromWatchlist("telegram", String(ctx.chat.id), address);
    await ctx.reply(removed ? "Удалено из наблюдения." : "Этого токена нет в вашем списке.");
  });

  bot.command("trending", async (ctx) => {
    if (await limited(ctx)) return;
    const r = await trendingOnFomo().catch(() => undefined);
    if (r === null)
      return ctx.reply("Социальные данные отключены: FOMO_API_KEY не задан (режим onchain-only).");
    if (!r) return ctx.reply("Источник трендов не ответил. Нет данных.");
    const lines = r.value
      .slice(0, 10)
      .map(
        (x) =>
          `${x.rank}. ${escapeHtml(x.symbol ?? shortAddress(x.address))} — ${escapeHtml(formatUsd(x.marketCapUsd, "ru") ?? nd)}\n<code>${x.address}</code>`,
      );
    await ctx.reply(lines.join("\n") || "Пусто.", { parse_mode: "HTML" });
  });

  // Group admins can silence automatic cards.
  bot.command(["quiet", "loud"], async (ctx) => {
    if (ctx.chat.type === "private") return ctx.reply("This works in groups.");
    const member = await ctx.getChatMember(ctx.from!.id).catch(() => null);
    if (!member || !["administrator", "creator"].includes(member.status)) {
      return ctx.reply("Only group admins can change this.");
    }
    const quiet = ctx.message!.text!.startsWith("/quiet");
    await setGroupQuiet(ctx.chat.id, quiet);
    return ctx.reply(
      quiet
        ? "OK, I won't reply to token addresses here. /loud to turn it back on."
        : "OK, I'll reply to token addresses with a quick risk check.",
    );
  });

  // Introduce ourselves once when added to a group.
  bot.on("my_chat_member", async (ctx) => {
    const was = ctx.myChatMember.old_chat_member.status;
    const now = ctx.myChatMember.new_chat_member.status;
    if (ctx.chat.type === "private" || !["member", "administrator"].includes(now)) return;
    if (["member", "administrator"].includes(was)) return;
    void recordBot("group_joined", ctx.chat.id).catch(() => undefined);
    await ctx
      .reply(
        [
          "<b>QUVR Pulse</b> is here 👋",
          "Paste any Robinhood Chain, Base or Solana token address and I'll reply with a quick risk check: contract powers, creator, holders, liquidity and ticker copies.",
          "",
          "Read-only: I never ask for keys or wallets. Admins: /quiet to mute, /loud to unmute.",
          'Updates and rug autopsies: <a href="https://x.com/quvrpulse">@quvrpulse on X</a>',
          "Independent analytics, not affiliated with Robinhood or Fomo. NFA.",
        ].join("\n"),
        { parse_mode: "HTML", link_preview_options: { is_disabled: true } },
      )
      .catch(() => undefined);
  });

  // Any message with a token address → quick card (groups: deduped and rate-limited).
  bot.on(["message:text", "message:caption"], async (ctx) => {
    // Never answer other bots: their messages may contain our own CA and loop forever.
    if (ctx.from?.is_bot) return;
    const text = ctx.message.text ?? ctx.message.caption ?? "";
    const isPrivate = ctx.chat.type === "private";
    if (isPrivate && /\b(seed|mnemonic|private key|приватн|сид)/i.test(text)) {
      return ctx.reply(
        "Никогда никому не отправляйте seed-фразу или приватный ключ. QUVR Pulse их не запрашивает.",
      );
    }
    const ref = extractTokenRef(text);
    if (!ref) {
      return isPrivate
        ? ctx.reply(
            "Отправьте адрес токена (0x… или Solana) — пришлю проверку. Команды: /scan, /watch, /unwatch, /status",
          )
        : undefined;
    }
    if (!isPrivate) {
      if (await isGroupQuiet(ctx.chat.id)) return;
      if (!(await firstMentionInWindow(ctx.chat.id, ref.address))) return;
      const rl = await rateLimit("tg-group", String(ctx.chat.id), 6, 60);
      if (!rl.ok) return;
    } else if (await limited(ctx)) return;
    await replyWithCard(ctx, ref.address, appUrl);
    void recordBot(
      isPrivate ? "card_private" : "card_group",
      isPrivate ? undefined : ctx.chat.id,
    ).catch(() => undefined);
  });

  // Inline mode: "@quvrpulse_bot <address>" in any chat.
  bot.on("inline_query", async (ctx) => {
    const ref = extractTokenRef(ctx.inlineQuery.query);
    if (ref) void recordBot("inline").catch(() => undefined);
    if (!ref) {
      return ctx.answerInlineQuery([], {
        cache_time: 60,
        button: { text: "Paste a token address to check it", start_parameter: "inline" },
      });
    }
    const report = await withTimeout(
      getTokenReport(ref.address, { crawler: true }).then((x) => x.report),
      7_000,
    ).catch(() => null);
    const url = `${appUrl.replace(/\/$/, "")}/token/${ref.address}`;
    if (!report) {
      return ctx.answerInlineQuery(
        [
          {
            type: "article",
            id: `open-${ref.address}`.slice(0, 64),
            title: "Open the QUVR Pulse report",
            description: "The first scan of a new token takes a few seconds",
            input_message_content: {
              message_text: `Risk check: <a href="${escapeHtml(url)}">${escapeHtml(shortAddress(ref.address))} on QUVR Pulse</a> · NFA`,
              parse_mode: "HTML",
            },
          },
        ],
        { cache_time: 30 },
      );
    }
    const clones = await withTimeout(tickerClones(report), 3_000).catch(() => null);
    const card = formatQuickCard(report, clones, appUrl);
    return ctx.answerInlineQuery(
      [
        {
          type: "article",
          id: `card-${ref.address}`.slice(0, 64),
          title: `${report.token.symbol.value ? "$" + report.token.symbol.value : shortAddress(report.address)} — ${levelLabel(report)}`,
          description: shareFacts(report).slice(0, 2).join(" · ") || "Open the full report",
          input_message_content: {
            message_text: card,
            parse_mode: "HTML",
            link_preview_options: { is_disabled: true },
          },
        },
      ],
      { cache_time: 60 },
    );
  });

  bot.catch((err) => log.error("bot error", { error: err.message }));
  return bot;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
  ]);
}

const QUIET_TTL = 10 * 365 * 86_400;
async function isGroupQuiet(chatId: number): Promise<boolean> {
  return (await cacheGet<boolean>(`tg-quiet:${chatId}`))?.value === true;
}
async function setGroupQuiet(chatId: number, quiet: boolean): Promise<void> {
  await cacheSet(`tg-quiet:${chatId}`, quiet, QUIET_TTL);
}

/** One card per token per group every 10 minutes — people often paste the same CA repeatedly. */
async function firstMentionInWindow(chatId: number, address: string): Promise<boolean> {
  const key = `tg-seen:${chatId}:${address}`;
  if (await cacheGet<boolean>(key)) return false;
  await cacheSet(key, true, 600);
  return true;
}

async function replyWithCard(ctx: Context, address: string, appUrl: string): Promise<void> {
  const chatId = ctx.chat!.id;
  const wait = await ctx.reply("🔎 Checking…", {
    reply_parameters: { message_id: ctx.message!.message_id, allow_sending_without_reply: true },
  });
  try {
    const { report, servedFrom } = await withTimeout(getTokenReport(address), 60_000);
    const clones = await withTimeout(tickerClones(report), 5_000).catch(() => null);
    const show = (r: TokenReport, footer = "") =>
      ctx.api.editMessageText(
        chatId,
        wait.message_id,
        formatQuickCard(r, clones, appUrl) + footer,
        {
          parse_mode: "HTML",
          link_preview_options: { is_disabled: true },
        },
      );
    if (servedFrom !== "quick") {
      await show(report);
      return;
    }
    // New token: answer in seconds, then complete the card when holders/creator are ready.
    await show(report, "\n\n<i>⏳ holders & creator loading…</i>");
    const full = await waitForFullReport(address, 90_000);
    if (full) await show(full).catch(() => undefined);
  } catch (e) {
    log.warn("quick card failed", { error: (e as Error).message });
    await ctx.api
      .editMessageText(
        chatId,
        wait.message_id,
        "Data sources did not answer in time — try again in a minute. We never show made-up numbers.",
      )
      .catch(() => undefined);
  }
}

async function main() {
  const token = env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    log.info("TELEGRAM_BOT_TOKEN is not set — bot disabled (web and worker keep running)");
    setInterval(() => {}, 1 << 30);
    return;
  }
  const bot = buildBot(token);
  await bot.api
    .setMyCommands([
      { command: "scan", description: "Быстрый отчёт по токену" },
      { command: "watch", description: "Наблюдать за токеном" },
      { command: "unwatch", description: "Перестать наблюдать" },
      { command: "trending", description: "Тренды Fomo" },
      { command: "quiet", description: "Группа: не отвечать на адреса" },
      { command: "loud", description: "Группа: снова отвечать на адреса" },
    ])
    .catch(() => undefined);

  if (env.TELEGRAM_MODE === "webhook") {
    if (!env.TELEGRAM_WEBHOOK_SECRET)
      throw new Error("TELEGRAM_WEBHOOK_SECRET is required in webhook mode");
    // grammY rejects updates whose X-Telegram-Bot-Api-Secret-Token header does not match.
    const handle = webhookCallback(bot, "http", { secretToken: env.TELEGRAM_WEBHOOK_SECRET });
    createServer((req, res) => {
      if (req.method !== "POST" || req.url !== "/telegram/webhook") {
        res.writeHead(404).end();
        return;
      }
      void handle(req, res);
    }).listen(env.TELEGRAM_WEBHOOK_PORT, () =>
      log.info("webhook listening", { port: env.TELEGRAM_WEBHOOK_PORT }),
    );
    // Telegram only delivers to public HTTPS URLs; the reverse proxy routes this path to the bot.
    const url = `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/telegram/webhook`;
    if (!url.startsWith("https://"))
      throw new Error("webhook mode needs an https NEXT_PUBLIC_APP_URL");
    await bot.api.setWebhook(url, {
      secret_token: env.TELEGRAM_WEBHOOK_SECRET,
      allowed_updates: ["message", "inline_query", "my_chat_member"],
      drop_pending_updates: false,
    });
    log.info("webhook registered", { path: "/telegram/webhook" });
  } else {
    await bot.api.deleteWebhook().catch(() => undefined);
    void bot.start({
      onStart: (me) => log.info("bot started (polling)", { username: me.username }),
    });
  }
  setInterval(() => void recordSourceStatus("telegram"), 60_000);
}

process.on("unhandledRejection", (e) => log.error("unhandled rejection", { error: String(e) }));
if (!process.env.VITEST) void main();
