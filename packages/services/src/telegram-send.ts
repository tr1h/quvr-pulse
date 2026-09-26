import { fetchJson } from "@quvr/providers";
import { serverEnv } from "@quvr/shared";

/** Sends an HTML-formatted Telegram message. The bot token stays server-side and is redacted in logs. */
export async function sendTelegramMessage(chatId: string, html: string): Promise<void> {
  const token = serverEnv().TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set");
  await fetchJson("telegram", `https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    body: { chat_id: chatId, text: html, parse_mode: "HTML", disable_web_page_preview: true },
    timeoutMs: 10_000,
    retries: 2,
  });
}
