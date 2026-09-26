import type {
  ContractAnalysis,
  ContractCapability,
  LocalizedText,
  RiskFinding,
  ScoreComponent,
  ScoreReason,
  ScoreResult,
  Severity,
  SimulationResult,
} from "@quvr/shared";
import { buildScore, t } from "./builder";

type CapId = ContractCapability["id"];

/** Weight of each dangerous privilege within the 30-point "no dangerous privileges" budget. */
export const PRIVILEGE_WEIGHTS: Partial<Record<CapId, number>> = {
  mint: 12,
  "balance-modify": 15,
  blacklist: 10,
  "trading-toggle": 10,
  "fee-change": 8,
  pause: 8,
  selfdestruct: 10,
  delegatecall: 6,
  "router-pair-change": 4,
};

const CAP_TEXT: Record<CapId, { title: LocalizedText; explain: LocalizedText }> = {
  mint: {
    title: t("Возможен выпуск новых токенов", "New tokens can be minted"),
    explain: t(
      "Контракт содержит функцию mint. Если её может вызвать владелец, предложение токена может быть увеличено, что размывает долю держателей.",
      "The contract exposes a mint function. If the owner can call it, supply can be inflated, diluting holders.",
    ),
  },
  pause: {
    title: t("Переводы могут быть приостановлены", "Transfers can be paused"),
    explain: t(
      "Владелец может остановить переводы и продажи.",
      "The owner can halt transfers and sells.",
    ),
  },
  blacklist: {
    title: t("Есть чёрный список адресов", "Address blacklist present"),
    explain: t(
      "Контракт может запрещать отдельным адресам переводы — в том числе продажу.",
      "The contract can block specific addresses from transferring — including selling.",
    ),
  },
  whitelist: {
    title: t("Есть списки исключений", "Exemption lists present"),
    explain: t(
      "Некоторые адреса могут быть освобождены от комиссий или ограничений.",
      "Some addresses can be exempt from fees or limits.",
    ),
  },
  "fee-change": {
    title: t("Комиссию торговли можно менять", "Trading fee can be changed"),
    explain: t(
      "Владелец может изменить комиссию покупки/продажи. Без верхнего предела это позволяет сделать продажу невыгодной.",
      "The owner can change buy/sell fees. Without an upper bound this can make selling uneconomic.",
    ),
  },
  "balance-modify": {
    title: t("Возможно изменение балансов", "Balances may be modifiable"),
    explain: t(
      "Обнаружены функции, которые могут напрямую менять или сжигать балансы пользователей.",
      "Functions were found that may directly set or burn user balances.",
    ),
  },
  "transfer-restriction": {
    title: t("Ограничения переводов", "Transfer restrictions"),
    explain: t(
      "Контракт может замораживать счета или задерживать переводы.",
      "The contract can freeze accounts or delay transfers.",
    ),
  },
  "max-wallet-tx": {
    title: t("Лимиты кошелька/транзакции", "Max wallet / max transaction limits"),
    explain: t(
      "Размер кошелька или сделки может ограничиваться владельцем.",
      "Wallet or trade size can be limited by the owner.",
    ),
  },
  "trading-toggle": {
    title: t("Торговлю можно включать/выключать", "Trading can be toggled"),
    explain: t(
      "Владелец может отключить торговлю — это классический механизм запрета продаж.",
      "The owner can disable trading — a classic way to block sells.",
    ),
  },
  "router-pair-change": {
    title: t("Можно сменить router/pair", "Router/pair can be changed"),
    explain: t(
      "Владелец может перенастроить, какой пул считается торговым.",
      "The owner can reconfigure which pool is treated as the market.",
    ),
  },
  ownership: {
    title: t("Управляемый владельцем контракт", "Owner-controlled contract"),
    explain: t("Контракт имеет владельца или роли.", "The contract has an owner or roles."),
  },
  upgrade: {
    title: t("Контракт обновляемый", "Upgradeable contract"),
    explain: t(
      "Логику контракта можно заменить. Всё, что проверено сегодня, может измениться после обновления.",
      "The contract logic can be replaced. Anything verified today may change after an upgrade.",
    ),
  },
  delegatecall: {
    title: t("Используется delegatecall", "Uses delegatecall"),
    explain: t(
      "Контракт выполняет чужой код в своём контексте. Вне стандартного прокси это может менять состояние непредсказуемо.",
      "The contract executes external code in its own context. Outside a standard proxy this can change state unpredictably.",
    ),
  },
  selfdestruct: {
    title: t("Опкод SELFDESTRUCT", "SELFDESTRUCT opcode"),
    explain: t(
      "В байткоде есть SELFDESTRUCT. После Cancun он не удаляет код в большинстве случаев, но может выводить ETH.",
      "Bytecode contains SELFDESTRUCT. Post-Cancun it rarely deletes code but can move ETH.",
    ),
  },
};

function capSeverity(c: ContractCapability): Severity {
  const w = PRIVILEGE_WEIGHTS[c.id];
  if (c.gated === "anyone" && (c.id === "mint" || c.id === "balance-modify")) return "critical";
  if (w === undefined) return c.id === "upgrade" ? "medium" : "info";
  if (c.gated === "renounced") return "low";
  if (c.probed === "succeeded") return w >= 10 ? "high" : "medium";
  return w >= 10 ? "medium" : "low";
}

export function contractFindings(
  a: ContractAnalysis,
  sim: SimulationResult | null,
  source: string,
  sourceUrl?: string,
): RiskFinding[] {
  const out: RiskFinding[] = [];
  if (!a.isContract) {
    out.push({
      code: "contract.not-contract",
      category: "contract",
      severity: "high",
      title: t("По адресу нет контракта", "No contract at this address"),
      explanation: t(
        "eth_getCode вернул пустой код: это обычный кошелёк или неверная сеть.",
        "eth_getCode returned empty code: this is a wallet or the wrong network.",
      ),
      evidence: ["eth_getCode = 0x"],
      source,
      confidence: "high",
    });
    return out;
  }

  if (a.verified === false) {
    out.push({
      code: "contract.unverified",
      category: "contract",
      severity: "medium",
      title: t("Исходный код не верифицирован", "Source code not verified"),
      explanation: t(
        "Без исходного кода проверка опирается только на байткод и симуляцию, выводы менее надёжны.",
        "Without source code, checks rely on bytecode and simulation only; conclusions are less reliable.",
      ),
      evidence: ["explorer: is_verified = false"],
      source: "blockscout",
      confidence: "high",
      sourceUrl,
    });
  }

  for (const c of a.capabilities) {
    if (!c.present || c.id === "ownership") continue;
    const text = CAP_TEXT[c.id];
    const gatedNote =
      c.gated === "anyone"
        ? t(
            " Вызов прошёл от случайного адреса — функция не защищена!",
            " The call succeeded from a random address — the function is unprotected!",
          )
        : c.gated === "renounced"
          ? t(
              " Владелец отказался от прав, поэтому риск снижен (но проверьте роли).",
              " Ownership is renounced, so risk is reduced (roles may still exist).",
            )
          : c.probed === "succeeded"
            ? t(
                " Read-only симуляция вызова от владельца прошла успешно.",
                " A read-only call from the owner succeeded.",
              )
            : t("", "");
    out.push({
      code: `contract.${c.id}${c.gated === "anyone" ? ".anyone" : ""}`,
      category: "contract",
      severity: capSeverity(c),
      title: text.title,
      explanation: { ru: text.explain.ru + gatedNote.ru, en: text.explain.en + gatedNote.en },
      evidence: c.evidence,
      source,
      confidence:
        c.probed === "succeeded"
          ? "high"
          : c.evidence.some((e) => e.startsWith("source:"))
            ? "high"
            : "medium",
    });
  }

  if (a.proxy.isProxy && a.proxy.kind === "eip1167") {
    out.push({
      code: "contract.clone",
      category: "contract",
      severity: "info",
      title: t("Клон шаблонного контракта (EIP-1167)", "Template clone (EIP-1167)"),
      explanation: t(
        `Токен создан фабрикой как минимальный клон шаблона ${a.proxy.implementation ?? "(неизвестно)"}. Адрес логики зашит в код клона и не может быть изменён — это не обновляемый прокси. Права проверены по коду шаблона.`,
        `The token was created by a factory as a minimal clone of template ${a.proxy.implementation ?? "(unknown)"}. The logic address is fixed in the clone's code and cannot be changed — this is not an upgradeable proxy. Powers were checked against the template's code.`,
      ),
      evidence: [`proxy kind: eip1167`, `implementation: ${a.proxy.implementation ?? "unknown"}`],
      source,
      confidence: "high",
    });
  } else if (a.proxy.isProxy) {
    out.push({
      code: "contract.proxy",
      category: "contract",
      severity: a.owner.isTimelock ? "low" : "medium",
      title: t("Прокси-контракт", "Proxy contract"),
      explanation: t(
        `Логика находится в implementation ${a.proxy.implementation ?? "(неизвестно)"} и может быть заменена администратором.`,
        `Logic lives in implementation ${a.proxy.implementation ?? "(unknown)"} and can be replaced by the admin.`,
      ),
      evidence: [`proxy kind: ${a.proxy.kind}`, `admin: ${a.proxy.admin ?? "unknown"}`],
      source,
      confidence: "high",
    });
  }

  if (a.owner.kind === "eoa") {
    out.push({
      code: "contract.owner.eoa",
      category: "contract",
      severity: a.capabilities.some((c) => c.present && PRIVILEGE_WEIGHTS[c.id] !== undefined)
        ? "medium"
        : "low",
      title: t("Владелец — обычный кошелёк", "Owner is a regular wallet"),
      explanation: t(
        "Права владельца контролирует один ключ без таймлока и мультиподписи.",
        "Owner privileges are controlled by a single key without a timelock or multisig.",
      ),
      evidence: [`owner(): ${a.owner.address}`],
      source,
      confidence: "high",
    });
  }

  if (a.bytecodeMatchesSource === false) {
    out.push({
      code: "contract.bytecode-mismatch",
      category: "contract",
      severity: "high",
      title: t("Байткод не совпадает с исходником", "Bytecode differs from verified source"),
      explanation: t(
        "Фактический код в сети отличается от опубликованного исходника (без учёта метаданных).",
        "On-chain code differs from the published source (metadata excluded).",
      ),
      evidence: ["eth_getCode vs explorer deployed_bytecode"],
      source,
      confidence: "medium",
    });
  }

  if (sim) {
    if (sim.status === "failed") {
      out.push({
        code: "contract.sell-simulation-failed",
        category: "contract",
        severity: "critical",
        title: t("Симуляция продажи не прошла", "Sell simulation failed"),
        explanation: t(
          "Read-only симуляция перевода по пути продажи откатилась. Продажа может быть заблокирована.",
          "A read-only simulation of the sell path reverted. Selling may be blocked.",
        ),
        evidence: [sim.method, sim.sell?.detail ?? "", sim.buy?.detail ?? ""].filter(Boolean),
        source: "rpc eth_call",
        confidence: "medium",
      });
    }
  }
  return out;
}

export type ContractSafetyInput = {
  analysis: ContractAnalysis | null;
  simulation: SimulationResult | null;
  now?: Date;
};

export function contractSafetyScore({
  analysis: a,
  simulation,
  now,
}: ContractSafetyInput): ScoreResult {
  const reasons: ScoreReason[] = [];
  const components: ScoreComponent[] = [];

  if (!a) {
    return buildScore({
      key: "contractSafety",
      components: [
        { id: "all", label: t("Анализ контракта", "Contract analysis"), points: null, max: 100 },
      ],
      reasons: [
        {
          text: t("Анализ контракта недоступен", "Contract analysis unavailable"),
          impact: "neutral",
        },
      ],
      now,
    });
  }
  if (!a.isContract) {
    return buildScore({
      key: "contractSafety",
      components: [{ id: "all", label: t("Контракт", "Contract"), points: null, max: 100 }],
      reasons: [
        { text: t("По адресу нет контракта", "No contract at this address"), impact: "negative" },
      ],
      now,
    });
  }

  // 1. Verified source (10)
  components.push({
    id: "verified",
    label: t("Верифицированный код", "Verified source"),
    points: a.verified === null ? null : a.verified ? 10 : 0,
    max: 10,
  });
  if (a.verified === true)
    reasons.push({
      text: t("Исходный код верифицирован", "Source code is verified"),
      impact: "positive",
    });
  else if (a.verified === false)
    reasons.push({
      text: t("Исходный код не верифицирован", "Source is not verified"),
      impact: "negative",
    });

  // 2. Dangerous privileges (30)
  let privPoints = 30;
  const dangerous: string[] = [];
  for (const c of a.capabilities) {
    const w = PRIVILEGE_WEIGHTS[c.id];
    if (!c.present || w === undefined) continue;
    if (c.id === "delegatecall" && a.proxy.isProxy) continue; // expected for proxies, scored in upgrade risk
    const factor = c.gated === "anyone" ? 2.5 : c.gated === "renounced" ? 0.25 : 1;
    privPoints -= w * factor;
    dangerous.push(c.id);
  }
  components.push({
    id: "privileges",
    label: t("Нет опасных привилегий", "No dangerous privileges"),
    points: Math.max(0, privPoints),
    max: 30,
  });
  if (dangerous.length === 0) {
    reasons.push({
      text: t(
        "Опасных привилегий в байткоде не найдено",
        "No dangerous privileges found in bytecode",
      ),
      impact: "positive",
    });
  } else {
    reasons.push({
      text: t(
        `Найдены привилегии: ${dangerous.join(", ")}`,
        `Privileges found: ${dangerous.join(", ")}`,
      ),
      impact: "negative",
    });
  }

  // 3. Ownership/admin safety (20)
  const hasPriv = dangerous.length > 0;
  let ownerPts: number | null;
  switch (a.owner.kind) {
    case "renounced":
    case "none":
      ownerPts = 20;
      reasons.push({
        text:
          a.owner.kind === "renounced"
            ? t("Владелец отказался от прав", "Ownership renounced")
            : t("Функции владельца не найдены", "No owner functions found"),
        impact: "positive",
      });
      break;
    case "contract":
      ownerPts =
        a.owner.isTimelock && (a.owner.timelockDelaySec ?? 0) >= 86_400
          ? 16
          : a.owner.isMultisig
            ? 12
            : 8;
      break;
    case "eoa":
      ownerPts = hasPriv ? 0 : 6;
      reasons.push({
        text: t("Владелец — один кошелёк (EOA)", "Owner is a single wallet (EOA)"),
        impact: "negative",
      });
      break;
    default:
      ownerPts = null;
  }
  components.push({
    id: "ownership",
    label: t("Безопасность владения", "Ownership/admin safety"),
    points: ownerPts,
    max: 20,
  });

  // 4. Sell simulation (20)
  const simPts =
    !simulation || simulation.status === "unavailable"
      ? null
      : simulation.status === "passed"
        ? 20
        : 0;
  components.push({
    id: "simulation",
    label: t("Симуляция продажи", "Sell simulation"),
    points: simPts,
    max: 20,
  });
  if (simulation?.status === "passed")
    reasons.push({
      text: t("Симуляция покупки/продажи прошла", "Buy/sell simulation passed"),
      impact: "positive",
    });
  else if (simulation?.status === "failed")
    reasons.push({
      text: t("Симуляция продажи не прошла", "Sell simulation failed"),
      impact: "negative",
    });
  else
    reasons.push({
      text: t("Симуляция продажи недоступна", "Sell simulation unavailable"),
      impact: "neutral",
    });

  // 5. Proxy / upgrade risk (10)
  const upgradeCap = a.capabilities.find((c) => c.id === "upgrade" && c.present);
  let proxyPts: number;
  // EIP-1167 clones are proxies with a permanently fixed logic address: no upgrade risk.
  const upgradeable = a.proxy.isProxy && a.proxy.kind !== "eip1167";
  if (!upgradeable && !upgradeCap) proxyPts = 10;
  else if (a.owner.isTimelock) proxyPts = 6;
  else proxyPts = 0;
  components.push({
    id: "upgrade",
    label: t("Риск обновления (proxy)", "Proxy/upgrade risk"),
    points: proxyPts,
    max: 10,
  });
  if (proxyPts === 0)
    reasons.push({
      text: t("Контракт может быть обновлён", "Contract is upgradeable"),
      impact: "negative",
    });

  // 6. Transfer restrictions (10)
  const restr = a.capabilities.filter(
    (c) => c.present && (c.id === "transfer-restriction" || c.id === "max-wallet-tx"),
  );
  const restrPts = restr.length === 0 ? 10 : restr.every((c) => c.gated === "renounced") ? 7 : 3;
  components.push({
    id: "restrictions",
    label: t("Нет ограничений переводов", "No transfer restrictions"),
    points: restrPts,
    max: 10,
  });

  return buildScore({
    key: "contractSafety",
    components,
    reasons,
    // A failed sell simulation dominates everything else.
    cap: simulation?.status === "failed" ? 20 : null,
    inputConfidence: a.verified ? "high" : "medium",
    now,
  });
}
