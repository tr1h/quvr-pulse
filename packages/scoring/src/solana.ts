import type {
  ContractAnalysis,
  ContractCapability,
  LocalizedText,
  RiskFinding,
  Severity,
} from "@quvr/shared";
import { t } from "./builder";

/**
 * Solana SPL / Token-2022 mint analysis. Unlike EVM there is no custom token bytecode: tokens
 * run on the standard SPL Token programs, and the risk lives in authorities and Token-2022
 * extensions recorded in the mint account itself. Everything here is read from that account.
 */
export type SolanaMintInput = {
  program: "spl-token" | "spl-token-2022" | "other";
  programId: string;
  mintAuthority: string | null;
  freezeAuthority: string | null;
  extensions: Array<{ extension: string; state: Record<string, unknown> }>;
};

type CapId = ContractCapability["id"];

type Rule = {
  id: CapId;
  code: string;
  severity: Severity;
  title: LocalizedText;
  explain: LocalizedText;
  evidence: string[];
  authority: string | null;
};

const str = (v: unknown) => (typeof v === "string" && v.length > 0 ? v : null);

export function analyzeSolanaMint(
  m: SolanaMintInput,
  /** true = wallet (on-curve key), false = program-derived / multisig, null = unknown */
  isWallet: (address: string) => boolean | null,
): { analysis: ContractAnalysis; findings: RiskFinding[] } {
  const rules: Rule[] = [];
  const ext = new Map(m.extensions.map((e) => [e.extension, e.state]));
  const feeReadings: ContractAnalysis["feeReadings"] = [];
  const findings: RiskFinding[] = [];

  if (m.mintAuthority) {
    rules.push({
      id: "mint",
      code: "solana.mint-authority",
      severity: "high",
      authority: m.mintAuthority,
      title: t("Можно выпустить новые токены", "New tokens can be minted"),
      explain: t(
        "Mint authority не отозван: владелец этого ключа может в любой момент допечатать токены и размыть долю держателей.",
        "Mint authority is not revoked: its holder can mint more tokens at any time and dilute holders.",
      ),
      evidence: [`mintAuthority = ${m.mintAuthority}`],
    });
  }
  if (m.freezeAuthority) {
    rules.push({
      id: "blacklist",
      code: "solana.freeze-authority",
      severity: "high",
      authority: m.freezeAuthority,
      title: t("Кошельки можно заморозить", "Wallets can be frozen"),
      explain: t(
        "Freeze authority не отозван: владелец ключа может заморозить токены в любом кошельке — после этого их нельзя продать.",
        "Freeze authority is not revoked: its holder can freeze the tokens in any wallet, which then cannot be sold.",
      ),
      evidence: [`freezeAuthority = ${m.freezeAuthority}`],
    });
  }

  const fee = ext.get("transferFeeConfig");
  if (fee) {
    const newer = (fee.newerTransferFee ?? {}) as Record<string, unknown>;
    const bps = Number(newer.transferFeeBasisPoints ?? 0);
    const feeAuth = str(fee.transferFeeConfigAuthority);
    feeReadings.push({ fn: "transferFeeBasisPoints", value: String(bps) });
    if (newer.maximumFee !== undefined)
      feeReadings.push({ fn: "maximumFee", value: String(newer.maximumFee) });
    if (bps > 0) {
      findings.push({
        code: "solana.transfer-fee",
        category: "contract",
        severity: bps >= 1000 ? "high" : bps >= 300 ? "medium" : "low",
        title: t(
          `Комиссия при каждом переводе ${bps / 100}%`,
          `Transfer fee ${bps / 100}% on every transfer`,
        ),
        explanation: t(
          "Token-2022 удерживает комиссию с каждого перевода, включая покупку и продажу.",
          "Token-2022 withholds a fee on every transfer, including buys and sells.",
        ),
        evidence: [`transferFeeBasisPoints = ${bps}`],
        source: "solana rpc mint",
        confidence: "high",
      });
    }
    if (feeAuth) {
      rules.push({
        id: "fee-change",
        code: "solana.fee-authority",
        severity: "medium",
        authority: feeAuth,
        title: t("Комиссию перевода можно изменить", "Transfer fee can be changed"),
        explain: t(
          "Ключ transfer fee authority может поднять комиссию (до максимума стандарта — 100%).",
          "The transfer fee authority can raise the fee (the standard allows up to 100%).",
        ),
        evidence: [`transferFeeConfigAuthority = ${feeAuth}`],
      });
    }
  }

  const hook = ext.get("transferHook");
  const hookProgram = hook ? str(hook.programId) : null;
  if (hookProgram) {
    rules.push({
      id: "transfer-restriction",
      code: "solana.transfer-hook",
      severity: "high",
      authority: str(hook!.authority),
      title: t(
        "На каждом переводе выполняется сторонняя программа",
        "A custom program runs on every transfer",
      ),
      explain: t(
        "Transfer hook вызывает отдельную программу при каждом переводе; она может запретить продажу.",
        "The transfer hook calls a separate program on every transfer; it can block selling.",
      ),
      evidence: [`transferHook.programId = ${hookProgram}`],
    });
  }

  const delegate = ext.get("permanentDelegate");
  const delegateKey = delegate ? str(delegate.delegate) : null;
  if (delegateKey) {
    rules.push({
      id: "balance-modify",
      code: "solana.permanent-delegate",
      severity: "critical",
      authority: delegateKey,
      title: t("Токены можно забрать с любого кошелька", "Tokens can be taken from any wallet"),
      explain: t(
        "Permanent delegate может переводить и сжигать токены из любого кошелька без разрешения владельца.",
        "The permanent delegate can transfer or burn tokens from any wallet without the owner's consent.",
      ),
      evidence: [`permanentDelegate = ${delegateKey}`],
    });
  }

  if (ext.has("nonTransferable")) {
    rules.push({
      id: "transfer-restriction",
      code: "solana.non-transferable",
      severity: "critical",
      authority: null,
      title: t("Токен нельзя передавать", "Token is non-transferable"),
      explain: t(
        "Расширение nonTransferable запрещает любые переводы — продать такой токен нельзя.",
        "The nonTransferable extension blocks all transfers — it cannot be sold.",
      ),
      evidence: ["extension nonTransferable"],
    });
  }

  const das = ext.get("defaultAccountState");
  if (das && String(das.accountState).toLowerCase() === "frozen") {
    rules.push({
      id: "transfer-restriction",
      code: "solana.default-frozen",
      severity: "high",
      authority: m.freezeAuthority,
      title: t("Новые кошельки заморожены по умолчанию", "New accounts are frozen by default"),
      explain: t(
        "Новые счета этого токена создаются замороженными и работают, только пока их «разморозит» владелец ключа.",
        "New token accounts start frozen and only work once the authority thaws them.",
      ),
      evidence: ["defaultAccountState = frozen"],
    });
  }

  const pausable = ext.get("pausableConfig");
  if (pausable && str(pausable.authority)) {
    rules.push({
      id: "pause",
      code: "solana.pausable",
      severity: pausable.paused === true ? "critical" : "medium",
      authority: str(pausable.authority),
      title: t(
        pausable.paused === true ? "Переводы сейчас на паузе" : "Переводы можно поставить на паузу",
        pausable.paused === true ? "Transfers are paused now" : "Transfers can be paused",
      ),
      explain: t(
        "Ключ pause authority может остановить все переводы токена.",
        "The pause authority can halt all transfers.",
      ),
      evidence: [
        `pausableConfig.authority = ${pausable.authority}`,
        `paused = ${String(pausable.paused)}`,
      ],
    });
  }

  for (const [name, label] of [
    [
      "scaledUiAmountConfig",
      t("Отображаемый баланс может меняться", "Displayed balance can change"),
    ],
    [
      "interestBearingConfig",
      t("Отображаемый баланс начисляет «проценты»", "Displayed balance accrues “interest”"),
    ],
  ] as const) {
    if (ext.has(name)) {
      findings.push({
        code: `solana.${name}`,
        category: "contract",
        severity: "low",
        title: label,
        explanation: t(
          "Расширение меняет только отображение баланса в кошельках, а не реальное количество токенов.",
          "The extension changes how balances are displayed, not the real token amount.",
        ),
        evidence: [`extension ${name}`],
        source: "solana rpc mint",
        confidence: "high",
      });
    }
  }

  if (m.program === "other") {
    findings.push({
      code: "solana.unknown-program",
      category: "contract",
      severity: "high",
      title: t("Нестандартная программа токена", "Non-standard token program"),
      explanation: t(
        "Mint принадлежит не SPL Token и не Token-2022 — его поведение нельзя проверить стандартно.",
        "The mint is not owned by SPL Token or Token-2022; its behaviour cannot be checked the standard way.",
      ),
      evidence: [`owner program ${m.programId}`],
      source: "solana rpc mint",
      confidence: "high",
    });
  }

  // Authorities decide ownership: all revoked → "renounced".
  const authorities = [...new Set(rules.map((r) => r.authority).filter((a): a is string => !!a))];
  const walletFlags = authorities.map((a) => isWallet(a));
  const ownerKind: ContractAnalysis["owner"]["kind"] =
    authorities.length === 0
      ? "renounced"
      : walletFlags.some((w) => w === true)
        ? "eoa"
        : walletFlags.every((w) => w === false)
          ? "contract"
          : "unknown";

  const capabilities: ContractCapability[] = rules.map((r) => ({
    id: r.id,
    present: true,
    evidence: [...r.evidence, "source: mint account (read-only)"],
    probed: "not-probed",
    gated: r.authority ? "owner" : "anyone",
  }));
  // Rules with no authority (e.g. nonTransferable) are inherent to the token, not "callable by anyone";
  // keep them as owner-gated so the privilege weight applies without the ×2.5 "anyone" multiplier.
  for (const c of capabilities) if (c.gated === "anyone") c.gated = "owner";

  for (const r of rules) {
    findings.push({
      code: r.code,
      category: "contract",
      severity: r.severity,
      title: r.title,
      explanation: r.explain,
      evidence: r.evidence,
      source: "solana rpc mint",
      confidence: "high",
    });
  }
  if (rules.length === 0 && m.program !== "other") {
    findings.push({
      code: "solana.authorities-revoked",
      category: "contract",
      severity: "info",
      title: t("Mint и freeze authority отозваны", "Mint and freeze authorities revoked"),
      explanation: t(
        "Новые токены выпустить нельзя, кошельки заморозить нельзя, опасных расширений Token-2022 нет. Это не гарантия безопасности: риски ликвидности и держателей проверяются отдельно.",
        "No new tokens can be minted, wallets cannot be frozen, and no risky Token-2022 extensions exist. This is not a safety guarantee: liquidity and holder risks are checked separately.",
      ),
      evidence: ["mintAuthority = null", "freezeAuthority = null"],
      source: "solana rpc mint",
      confidence: "high",
    });
  }

  const analysis: ContractAnalysis = {
    isContract: true,
    codeHash: null,
    bytecodeSize: null,
    // Standard SPL programs: the code is public and audited; "unverified" does not apply.
    verified: m.program === "other" ? null : true,
    contractName:
      m.program === "spl-token-2022"
        ? "SPL Token-2022"
        : m.program === "spl-token"
          ? "SPL Token"
          : null,
    compiler: null,
    proxy: { isProxy: false, kind: null, implementation: null, admin: null },
    owner: {
      address: authorities[0] ?? null,
      kind: ownerKind,
      isTimelock: null,
      timelockDelaySec: null,
      isMultisig: null,
    },
    capabilities,
    feeReadings,
    bytecodeMatchesSource: null,
    selectorsFound: m.extensions.length,
  };
  const sev = { critical: 0, high: 1, medium: 2, low: 3, info: 4 } as const;
  findings.sort((a, b) => sev[a.severity] - sev[b.severity]);
  return { analysis, findings };
}

const SOLANA_WORDING: Record<string, LocalizedText> = {
  "Source code is verified": t(
    "Стандартная программа SPL Token: открытый проверенный код",
    "Standard SPL Token program: open, audited code",
  ),
  "No dangerous privileges found in bytecode": t(
    "Опасных полномочий и расширений в mint не найдено",
    "No risky authorities or extensions in the mint",
  ),
  "Ownership renounced": t("Все полномочия mint отозваны", "All mint authorities revoked"),
  "Owner is a single wallet (EOA)": t(
    "Полномочия у обычного кошелька",
    "Authorities held by a regular wallet",
  ),
  "Verified source": t("Стандартная программа токена", "Standard token program"),
  "No dangerous privileges": t("Нет опасных полномочий", "No risky authorities"),
  "Ownership/admin safety": t("Полномочия отозваны", "Authorities revoked"),
  "Proxy/upgrade risk": t("Неизменяемость программы", "Program immutability"),
};

/** Contract Safety is shared with EVM; this rewrites its wording for Solana mints. */
export function solanaWording<
  T extends {
    reasons: Array<{ text: LocalizedText }>;
    components: Array<{ label: LocalizedText }>;
  },
>(score: T): T {
  const map = (x: LocalizedText): LocalizedText => {
    const direct = SOLANA_WORDING[x.en];
    if (direct) return direct;
    if (x.en.startsWith("Privileges found: ")) {
      const list = x.en.slice("Privileges found: ".length);
      return t(`Найдены полномочия: ${list}`, `Authorities found: ${list}`);
    }
    return x;
  };
  return {
    ...score,
    reasons: score.reasons.map((r) => ({ ...r, text: map(r.text) })),
    components: score.components.map((c) => ({ ...c, label: map(c.label) })),
  };
}
