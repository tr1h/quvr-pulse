type Level = "debug" | "info" | "warn" | "error";
const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const SECRET_KEYS =
  /^(.*_)?(api_?key|apikey|secret|password|authorization|cookie|bot_?token|access_?token|auth_?token|bearer)$/i;
const SECRET_PATTERNS: Array<[RegExp, string]> = [
  [/((?:apikey|api_key|key)=)[^&\s"]+/gi, "$1[REDACTED]"],
  [/(Bearer\s+)[A-Za-z0-9._~+/=-]+/g, "$1[REDACTED]"],
  [/(\/v2\/)[A-Za-z0-9_-]{16,}/g, "$1[REDACTED]"], // Alchemy-style key in URL path
  [/(bot)\d+:[A-Za-z0-9_-]{20,}/g, "$1[REDACTED]"], // Telegram bot token in URLs
];

export function redactString(s: string): string {
  let out = s;
  for (const [pattern, replacement] of SECRET_PATTERNS) out = out.replace(pattern, replacement);
  return out;
}

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[depth]";
  if (typeof value === "string") return redactString(value);
  if (value instanceof Error) {
    return { name: value.name, message: redactString(value.message) };
  }
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] =
        SECRET_KEYS.test(k) && typeof v === "string" && v.length > 0
          ? "[REDACTED]"
          : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

export type Logger = {
  debug(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
  child(fields: Record<string, unknown>): Logger;
};

/** Structured JSON logs, one object per line. Secrets are redacted by key name and by pattern. */
export function createLogger(base: Record<string, unknown> = {}): Logger {
  const write = (level: Level, msg: string, fields?: Record<string, unknown>) => {
    const min = LEVELS[(process.env.LOG_LEVEL as Level) ?? "info"] ?? LEVELS.info;
    if (LEVELS[level] < min) return;
    const line = JSON.stringify(
      redact({ ts: new Date().toISOString(), level, msg, ...base, ...(fields ?? {}) }),
    );
    if (level === "error" || level === "warn") console.error(line);
    else console.log(line);
  };
  return {
    debug: (m, f) => write("debug", m, f),
    info: (m, f) => write("info", m, f),
    warn: (m, f) => write("warn", m, f),
    error: (m, f) => write("error", m, f),
    child: (f) => createLogger({ ...base, ...f }),
  };
}

export const logger = createLogger({ app: "quvr-pulse" });
