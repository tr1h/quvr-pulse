import type { LocalizedText } from "@quvr/shared";

/**
 * Search landing pages. Each answers a real query ("how to check a token for a rug pull",
 * "pump.fun token checker", ...) with honest, useful text and links into live reports.
 * Wording rules apply here too: never "safe", no return promises, "possibly related" wallets.
 */
export type Landing = {
  slug: string;
  /** Radar tokens to list at the bottom (internal links into reports). */
  chain: "Robinhood Chain" | "Solana" | null;
  title: LocalizedText;
  description: LocalizedText;
  h1: LocalizedText;
  lead: LocalizedText;
  sections: Array<{ h: LocalizedText; p: LocalizedText[] }>;
  faq: Array<{ q: LocalizedText; a: LocalizedText }>;
};

const noAdvice: { q: LocalizedText; a: LocalizedText } = {
  q: {
    ru: "Сервис говорит, какой токен купить?",
    en: "Does the service tell me which token to buy?",
    de: "Sagt mir der Dienst, welchen Token ich kaufen soll?",
    es: "¿El servicio me dice qué token comprar?",
    zh: "这个服务会告诉我买哪个代币吗？",
  },
  a: {
    ru: "Нет. QUVR Pulse показывает проверяемые риски и факты, но не даёт советов купить или продать и не прогнозирует цену. «Низкий обнаруженный риск» не означает, что токен вырастет или что потерь не будет.",
    en: "No. QUVR Pulse shows verifiable risks and facts, but gives no buy/sell advice and no price forecasts. “Low detected risk” does not mean the token will go up or that you cannot lose money.",
    de: "Nein. QUVR Pulse zeigt überprüfbare Risiken und Fakten, gibt aber keine Kauf- oder Verkaufsempfehlungen und keine Kursprognosen. „Geringes erkanntes Risiko“ heißt nicht, dass der Token steigt oder dass du kein Geld verlieren kannst.",
    es: "No. QUVR Pulse muestra riesgos y hechos verificables, pero no da consejos de compra o venta ni previsiones de precio. «Riesgo detectado bajo» no significa que el token vaya a subir ni que no puedas perder dinero.",
    zh: "不会。QUVR Pulse 展示可核实的风险和事实，但不提供买卖建议，也不做价格预测。“检出风险较低”并不代表代币会上涨，也不代表你不会亏钱。",
  },
};

const free: { q: LocalizedText; a: LocalizedText } = {
  q: {
    ru: "Это бесплатно? Нужно подключать кошелёк?",
    en: "Is it free? Do I need to connect a wallet?",
    de: "Ist es kostenlos? Muss ich eine Wallet verbinden?",
    es: "¿Es gratis? ¿Tengo que conectar una wallet?",
    zh: "免费吗？需要连接钱包吗？",
  },
  a: {
    ru: "Бесплатно и без регистрации. Кошелёк подключать не нужно: сервис только читает публичные данные блокчейна и никогда не просит seed-фразу или приватный ключ. Если кто-то просит их от имени QUVR Pulse — это мошенники.",
    en: "Free, no sign-up. No wallet connection: the service only reads public blockchain data and never asks for a seed phrase or private key. Anyone asking for them in QUVR Pulse’s name is a scammer.",
    de: "Kostenlos, ohne Anmeldung. Keine Wallet-Verbindung: Der Dienst liest nur öffentliche Blockchain-Daten und fragt nie nach Seed-Phrase oder Private Key. Wer im Namen von QUVR Pulse danach fragt, ist ein Betrüger.",
    es: "Gratis y sin registro. No hace falta conectar wallet: el servicio solo lee datos públicos de la blockchain y nunca pide la frase semilla ni la clave privada. Quien las pida en nombre de QUVR Pulse es un estafador.",
    zh: "免费，无需注册，也无需连接钱包：本服务只读取公开的区块链数据，从不索要助记词或私钥。任何以 QUVR Pulse 名义索要这些信息的人都是骗子。",
  },
};

export const LANDINGS: Landing[] = [
  {
    slug: "rug-pull-check",
    chain: null,
    title: {
      ru: "Как проверить токен на скам и rug pull перед покупкой — чек-лист",
      en: "How to check a token for a scam or rug pull before buying — checklist",
      de: "Token vor dem Kauf auf Scam und Rug Pull prüfen — Checkliste",
      es: "Cómo revisar un token en busca de estafa o rug pull antes de comprar — checklist",
      zh: "买入前如何检查代币是否为骗局或跑路盘——清单",
    },
    description: {
      ru: "Пошаговый чек-лист: контракт и полномочия, ликвидность и проскальзывание, концентрация держателей, действия создателя и связанные кошельки. Проверка любого токена Robinhood Chain, Base и Solana за минуту.",
      en: "Step-by-step checklist: contract and authorities, liquidity, holder concentration, creator activity and possibly related wallets. Check any Robinhood Chain or Solana token in a minute.",
      de: "Schritt-für-Schritt-Checkliste: Contract und Berechtigungen, Liquidität, Holder-Konzentration, Aktivität des Creators und möglicherweise verbundene Wallets. Prüfe jeden Token auf Robinhood Chain oder Solana in einer Minute.",
      es: "Checklist paso a paso: contrato y autoridades, liquidez, concentración de holders, actividad del creador y wallets posiblemente vinculadas. Revisa cualquier token de Robinhood Chain o Solana en un minuto.",
      zh: "分步清单：合约与权限、流动性、持仓集中度、创建者动态以及可能关联的钱包。一分钟检查任意 Robinhood Chain 或 Solana 代币。",
    },
    h1: {
      ru: "Как проверить токен на скам перед покупкой",
      en: "How to check a token for a scam before you buy",
      de: "So prüfst du einen Token vor dem Kauf auf Scam",
      es: "Cómo revisar un token antes de comprar",
      zh: "买入前如何检查代币是否为骗局",
    },
    lead: {
      ru: "Большинство потерь на мемкоинах случаются не из-за «плохого рынка», а из-за признаков, которые видны заранее: создатель может допечатать токены, ликвидности мало, а половина монет лежит у нескольких связанных кошельков. Вот что проверять — и как сделать это за минуту.",
      en: "Most memecoin losses are not bad luck: the warning signs are usually visible in advance — the creator can mint more tokens, liquidity is thin, or half the supply sits in a few linked wallets. Here is what to check, and how to do it in a minute.",
      de: "Die meisten Memecoin-Verluste sind kein Pech: Die Warnsignale sind meist vorher sichtbar — der Creator kann weitere Tokens minten, die Liquidität ist dünn oder die Hälfte des Angebots liegt in wenigen verbundenen Wallets. Hier steht, was du prüfen solltest und wie das in einer Minute geht.",
      es: "La mayoría de las pérdidas con memecoins no son mala suerte: las señales de alerta suelen verse de antemano — el creador puede emitir más tokens, la liquidez es escasa o la mitad del suministro está en unas pocas wallets vinculadas. Esto es lo que debes revisar y cómo hacerlo en un minuto.",
      zh: "大多数 Memecoin 亏损并非运气不好：危险信号通常事先就能看到——创建者可以增发代币、流动性很薄，或者一半供应量集中在几个关联钱包里。下面告诉你该检查什么，以及如何在一分钟内完成。",
    },
    sections: [
      {
        h: {
          ru: "1. Контракт: кто им управляет",
          en: "1. Contract: who controls it",
          de: "1. Contract: Wer ihn kontrolliert",
          es: "1. Contrato: quién lo controla",
          zh: "1. 合约：谁在控制",
        },
        p: [
          {
            ru: "Главный вопрос — может ли кто-то после вашей покупки изменить правила. Опасные признаки: право выпускать новые токены (mint), замораживать кошельки (freeze), ставить комиссию на продажу, вносить адреса в чёрный список или ставить контракт на паузу. На Solana смотрите mint authority и freeze authority, а у Token-2022 — расширения вроде permanent delegate и transfer hook.",
            en: "The key question is whether someone can change the rules after you buy. Red flags: the power to mint more tokens, freeze wallets, set sell taxes, blacklist addresses or pause the contract. On Solana check the mint and freeze authorities and Token-2022 extensions such as permanent delegate and transfer hook.",
            de: "Die Kernfrage: Kann jemand nach deinem Kauf die Regeln ändern? Warnsignale: die Möglichkeit, weitere Tokens zu minten, Wallets einzufrieren, Verkaufssteuern festzulegen, Adressen zu blacklisten oder den Contract zu pausieren. Auf Solana prüfe Mint- und Freeze-Authority sowie Token-2022-Erweiterungen wie Permanent Delegate und Transfer Hook.",
            es: "La pregunta clave es si alguien puede cambiar las reglas después de que compres. Señales de alerta: poder emitir más tokens, congelar wallets, fijar impuestos a la venta, poner direcciones en lista negra o pausar el contrato. En Solana revisa las autoridades de mint y freeze y las extensiones Token-2022 como permanent delegate y transfer hook.",
            zh: "关键问题是：你买入之后，是否有人能改变规则。危险信号：可以增发代币、冻结钱包、设置卖出税、拉黑地址或暂停合约。在 Solana 上要检查 mint 与 freeze 权限，以及 permanent delegate、transfer hook 等 Token-2022 扩展。",
          },
          {
            ru: "Поиск названий функций в коде — не доказательство. QUVR Pulse сверяет байткод и делает read-only пробы, а для Solana читает сам mint-аккаунт.",
            en: "Searching the code for function names is not proof. QUVR Pulse checks the bytecode and runs read-only probes; for Solana it reads the mint account itself.",
            de: "Nach Funktionsnamen im Code zu suchen ist kein Beweis. QUVR Pulse prüft den Bytecode und führt Read-only-Tests aus; bei Solana liest es direkt den Mint-Account.",
            es: "Buscar nombres de funciones en el código no es una prueba. QUVR Pulse revisa el bytecode y ejecuta pruebas de solo lectura; en Solana lee directamente la cuenta del mint.",
            zh: "在代码里搜索函数名并不能作为证据。QUVR Pulse 会检查字节码并进行只读探测；对 Solana 则直接读取 mint 账户。",
          },
        ],
      },
      {
        h: {
          ru: "2. Ликвидность: сможете ли вы продать",
          en: "2. Liquidity: can you actually sell",
          de: "2. Liquidität: Kannst du wirklich verkaufen",
          es: "2. Liquidez: ¿de verdad puedes vender?",
          zh: "2. 流动性：你真的卖得出去吗",
        },
        p: [
          {
            ru: "Смотрите не только на сумму ликвидности, но и на её отношение к капитализации и на проскальзывание: насколько упадёт цена, если продать на $1 000. Если ликвидность меньше нескольких процентов от капитализации, крупная продажа обвалит цену, а «капитализация» на экране — во многом бумажная.",
            en: "Look beyond the liquidity amount: compare it with market cap and check price impact — how far the price drops on a $1,000 sell. If liquidity is only a few percent of market cap, one large sell crashes the price and the market cap on screen is largely on paper.",
            de: "Schau über die Liquiditätssumme hinaus: Vergleiche sie mit der Marktkapitalisierung und prüfe den Preiseinfluss — wie stark der Kurs bei einem Verkauf von 1.000 $ fällt. Beträgt die Liquidität nur wenige Prozent der Marktkapitalisierung, lässt ein großer Verkauf den Kurs einbrechen, und die angezeigte Marktkapitalisierung existiert größtenteils nur auf dem Papier.",
            es: "Mira más allá de la cantidad de liquidez: compárala con la capitalización y revisa el impacto en el precio — cuánto cae el precio con una venta de 1.000 $. Si la liquidez es solo un pequeño porcentaje de la capitalización, una venta grande hunde el precio y la capitalización que ves es en gran parte de papel.",
            zh: "不要只看流动性金额：要把它与市值对比，并查看价格影响——卖出 1,000 美元时价格会跌多少。如果流动性只占市值的几个百分点，一笔大额卖出就会让价格暴跌，屏幕上的市值很大程度上只是纸面数字。",
          },
        ],
      },
      {
        h: {
          ru: "3. Держатели: у кого монеты",
          en: "3. Holders: who owns the supply",
          de: "3. Holder: Wem das Angebot gehört",
          es: "3. Holders: quién tiene el suministro",
          zh: "3. 持有人：代币在谁手里",
        },
        p: [
          {
            ru: "Посчитайте долю топ-10 держателей, но без пулов ликвидности, бондинг-кривых и сожжённых адресов — иначе цифра обманчива. Отдельно проверьте долю создателя и кошельков, которые, возможно, с ним связаны: получили токены напрямую от создателя, были профинансированы с одного адреса или купили в одном блоке.",
            en: "Measure the top-10 share excluding liquidity pools, bonding curves and burn addresses, or the number is misleading. Then check the creator’s share and wallets possibly linked to them: funded by the same address, receiving tokens straight from the creator, or buying in the same block.",
            de: "Miss den Anteil der Top 10 ohne Liquiditätspools, Bonding Curves und Burn-Adressen, sonst ist die Zahl irreführend. Prüfe dann den Anteil des Creators und der möglicherweise mit ihm verbundenen Wallets: von derselben Adresse finanziert, Tokens direkt vom Creator erhalten oder im selben Block gekauft.",
            es: "Mide la cuota del top 10 sin pools de liquidez, bonding curves ni direcciones de quema; si no, la cifra engaña. Luego revisa la cuota del creador y de las wallets posiblemente vinculadas a él: financiadas desde la misma dirección, que recibieron tokens directamente del creador o que compraron en el mismo bloque.",
            zh: "计算前 10 持有人占比时，要剔除流动性池、bonding curve 和销毁地址，否则数字会误导人。然后查看创建者的占比，以及可能与其关联的钱包：由同一地址注资、直接从创建者处收到代币，或在同一区块买入。",
          },
          {
            ru: "Связь кошельков — это эвристика, а не доказательство общего владельца. Биржи и боты финансируют тысячи несвязанных адресов, поэтому такие источники мы отсеиваем.",
            en: "Wallet links are a heuristic, not proof of common ownership. Exchanges and bots fund thousands of unrelated addresses, so such sources are filtered out.",
            de: "Wallet-Verbindungen sind eine Heuristik, kein Beweis für einen gemeinsamen Besitzer. Börsen und Bots finanzieren Tausende nicht verbundener Adressen, daher werden solche Quellen herausgefiltert.",
            es: "Los vínculos entre wallets son una heurística, no una prueba de propietario común. Los exchanges y bots financian miles de direcciones sin relación, por eso esas fuentes se filtran.",
            zh: "钱包关联是一种启发式判断，并不能证明属于同一所有者。交易所和机器人会为成千上万个互不相关的地址注资，因此这类来源会被过滤掉。",
          },
        ],
      },
      {
        h: {
          ru: "4. Создатель: что он делает сейчас",
          en: "4. Creator: what they are doing now",
          de: "4. Creator: Was er gerade tut",
          es: "4. Creador: qué está haciendo ahora",
          zh: "4. 创建者：他现在在做什么",
        },
        p: [
          {
            ru: "Продажи создателя в первые часы и дни — один из самых надёжных тревожных сигналов. Проверьте историю кошелька создателя: покупки, продажи и переводы этого токена.",
            en: "Creator sells in the first hours and days are one of the most reliable warning signs. Check the creator wallet’s history: buys, sells and transfers of this token.",
            de: "Verkäufe des Creators in den ersten Stunden und Tagen gehören zu den verlässlichsten Warnsignalen. Prüfe den Verlauf der Creator-Wallet: Käufe, Verkäufe und Transfers dieses Tokens.",
            es: "Las ventas del creador en las primeras horas y días son una de las señales de alerta más fiables. Revisa el historial de la wallet del creador: compras, ventas y transferencias de este token.",
            zh: "创建者在最初几小时、几天内卖出，是最可靠的危险信号之一。查看创建者钱包的历史：该代币的买入、卖出和转账。",
          },
        ],
      },
      {
        h: {
          ru: "5. Шум в соцсетях ≠ безопасность",
          en: "5. Social hype ≠ safety",
          de: "5. Social-Hype ≠ geringes Risiko",
          es: "5. Hype social ≠ bajo riesgo",
          zh: "5. 社交热度 ≠ 低风险",
        },
        p: [
          {
            ru: "Высокий социальный импульс означает только внимание, а не надёжность. Полезнее смотреть, кто пишет о токене и продают ли эти авторы после своих постов.",
            en: "High social momentum means attention, not reliability. It is more useful to see who is posting about the token and whether those authors sell after their posts.",
            de: "Hohes Social-Momentum bedeutet Aufmerksamkeit, nicht Verlässlichkeit. Nützlicher ist es zu sehen, wer über den Token postet und ob diese Autoren nach ihren Posts verkaufen.",
            es: "Un impulso social alto significa atención, no fiabilidad. Es más útil ver quién publica sobre el token y si esos autores venden después de sus publicaciones.",
            zh: "社交热度高只代表关注度，而非可靠性。更有用的是看谁在发帖谈论这个代币，以及这些作者发帖后是否卖出。",
          },
        ],
      },
    ],
    faq: [
      {
        q: {
          ru: "Можно ли гарантированно отличить скам?",
          en: "Can a scam be detected with certainty?",
          de: "Lässt sich ein Scam mit Sicherheit erkennen?",
          es: "¿Se puede detectar una estafa con certeza?",
          zh: "能百分之百识别骗局吗？",
        },
        a: {
          ru: "Нет. Проверка находит известные признаки риска, но не даёт гарантий. Поэтому мы пишем «низкий обнаруженный риск», а не «безопасно». Если источник данных не ответил, показываем «Нет данных», а не ноль.",
          en: "No. A check finds known risk signs but cannot guarantee anything. That is why we say “low detected risk”, never “safe”. If a data source does not answer we show “No data”, not zero.",
          de: "Nein. Eine Prüfung findet bekannte Risikomerkmale, kann aber nichts garantieren. Deshalb sagen wir „geringes erkanntes Risiko“ und nie „sicher“. Antwortet eine Datenquelle nicht, zeigen wir „Keine Daten“ statt null.",
          es: "No. Una revisión encuentra señales de riesgo conocidas, pero no puede garantizar nada. Por eso decimos «riesgo detectado bajo» y nunca «seguro». Si una fuente de datos no responde, mostramos «Sin datos», no cero.",
          zh: "不能。检查只能发现已知的风险迹象，无法保证任何事情。因此我们只说“检出风险较低”，从不说“安全”。如果某个数据源没有响应，我们显示“暂无数据”，而不是零。",
        },
      },
      noAdvice,
      free,
    ],
  },
  {
    slug: "solana-token-checker",
    chain: "Solana",
    title: {
      ru: "Проверка токенов Solana и pump.fun на скам — бесплатный сканер",
      en: "Solana & pump.fun token checker — free rug-pull scanner",
      de: "Solana- & pump.fun-Token-Checker — kostenloser Rug-Pull-Scanner",
      es: "Verificador de tokens de Solana y pump.fun — escáner gratuito de rug pulls",
      zh: "Solana 与 pump.fun 代币检测——免费跑路扫描器",
    },
    description: {
      ru: "Вставьте адрес mint и получите отчёт: mint и freeze authority, расширения Token-2022, ликвидность PumpSwap/Raydium, топ держателей без пулов, создатель pump.fun и возможно связанные кошельки.",
      en: "Paste a mint address to get a report: mint & freeze authority, Token-2022 extensions, PumpSwap/Raydium liquidity, top holders without pools, pump.fun creator and possibly related wallets.",
      de: "Füge eine Mint-Adresse ein und erhalte einen Bericht: Mint- & Freeze-Authority, Token-2022-Erweiterungen, Liquidität auf PumpSwap/Raydium, Top-Holder ohne Pools, pump.fun-Creator und möglicherweise verbundene Wallets.",
      es: "Pega una dirección de mint y obtén un informe: autoridades de mint y freeze, extensiones Token-2022, liquidez en PumpSwap/Raydium, principales holders sin pools, creador en pump.fun y wallets posiblemente vinculadas.",
      zh: "粘贴 mint 地址即可获得报告：mint 与 freeze 权限、Token-2022 扩展、PumpSwap/Raydium 流动性、剔除池子后的主要持有人、pump.fun 创建者以及可能关联的钱包。",
    },
    h1: {
      ru: "Проверка токенов Solana и pump.fun",
      en: "Solana and pump.fun token checker",
      de: "Solana- und pump.fun-Token-Checker",
      es: "Verificador de tokens de Solana y pump.fun",
      zh: "Solana 与 pump.fun 代币检测",
    },
    lead: {
      ru: "Вставьте адрес токена Solana (mint) — сервис сам поймёт сеть и за несколько секунд соберёт отчёт из блокчейна и рынка. Без подключения кошелька.",
      en: "Paste a Solana token (mint) address — the chain is detected automatically and a report is built from on-chain and market data in seconds. No wallet connection.",
      de: "Füge eine Solana-Token-Adresse (Mint) ein — das Netzwerk wird automatisch erkannt und in Sekunden ein Bericht aus On-chain- und Marktdaten erstellt. Keine Wallet-Verbindung.",
      es: "Pega la dirección de un token de Solana (mint): la red se detecta automáticamente y en segundos se genera un informe con datos onchain y de mercado. Sin conectar wallet.",
      zh: "粘贴 Solana 代币（mint）地址——系统自动识别网络，几秒内根据链上和市场数据生成报告。无需连接钱包。",
    },
    sections: [
      {
        h: {
          ru: "Что проверяется",
          en: "What is checked",
          de: "Was geprüft wird",
          es: "Qué se revisa",
          zh: "检查内容",
        },
        p: [
          {
            ru: "Mint authority (можно ли допечатать токены) и freeze authority (можно ли заморозить ваш кошелёк). Для Token-2022 — опасные расширения: permanent delegate, transfer hook, комиссия за перевод, «непереводимые» токены.",
            en: "Mint authority (can more tokens be printed) and freeze authority (can your wallet be frozen). For Token-2022 — risky extensions: permanent delegate, transfer hook, transfer fees, non-transferable tokens.",
            de: "Mint-Authority (können weitere Tokens gedruckt werden) und Freeze-Authority (kann deine Wallet eingefroren werden). Bei Token-2022 — riskante Erweiterungen: Permanent Delegate, Transfer Hook, Transfergebühren, nicht übertragbare Tokens.",
            es: "Autoridad de mint (si se pueden emitir más tokens) y autoridad de freeze (si pueden congelar tu wallet). En Token-2022, extensiones de riesgo: permanent delegate, transfer hook, comisiones por transferencia, tokens no transferibles.",
            zh: "Mint 权限（能否增发代币）和 freeze 权限（能否冻结你的钱包）。对 Token-2022 还会检查风险扩展：permanent delegate、transfer hook、转账手续费、不可转让代币。",
          },
          {
            ru: "Ликвидность и проскальзывание в пулах PumpSwap, Raydium, Meteora и Orca; топ держателей без пулов и бондинг-кривых; создатель токена (для pump.fun — точно, из аккаунта бондинг-кривой) и его продажи; кошельки, возможно связанные с создателем или друг с другом.",
            en: "Liquidity and price impact in PumpSwap, Raydium, Meteora and Orca pools; top holders excluding pools and bonding curves; the token creator (exact for pump.fun, read from the bonding-curve account) and their sells; wallets possibly linked to the creator or to each other.",
            de: "Liquidität und Preiseinfluss in Pools von PumpSwap, Raydium, Meteora und Orca; Top-Holder ohne Pools und Bonding Curves; der Creator des Tokens (bei pump.fun exakt, aus dem Bonding-Curve-Account gelesen) und seine Verkäufe; Wallets, die möglicherweise mit dem Creator oder untereinander verbunden sind.",
            es: "Liquidez e impacto en el precio en pools de PumpSwap, Raydium, Meteora y Orca; principales holders sin pools ni bonding curves; el creador del token (exacto en pump.fun, leído de la cuenta de la bonding curve) y sus ventas; wallets posiblemente vinculadas al creador o entre sí.",
            zh: "PumpSwap、Raydium、Meteora 和 Orca 池中的流动性与价格影响；剔除池子和 bonding curve 后的主要持有人；代币创建者（pump.fun 代币可从 bonding curve 账户精确读取）及其卖出记录；可能与创建者或彼此关联的钱包。",
          },
        ],
      },
      {
        h: {
          ru: "Что пока не проверяется",
          en: "What is not checked yet",
          de: "Was noch nicht geprüft wird",
          es: "Qué todavía no se revisa",
          zh: "暂未检查的内容",
        },
        p: [
          {
            ru: "Для Solana пока нет симуляции продажи и истории числа держателей — эти пункты честно отмечены «Нет данных» и не влияют на оценку как ноль.",
            en: "For Solana there is no sell simulation or holder-count history yet — these are honestly marked “No data” and never counted as zero.",
            de: "Für Solana gibt es noch keine Verkaufssimulation und keinen Verlauf der Holder-Anzahl — diese Punkte sind ehrlich als „Keine Daten“ markiert und werden nie als null gezählt.",
            es: "Para Solana aún no hay simulación de venta ni historial del número de holders: esos puntos se marcan honestamente como «Sin datos» y nunca cuentan como cero.",
            zh: "Solana 暂不支持卖出模拟和持有人数量历史——这些项目会如实标为“暂无数据”，绝不按零计算。",
          },
        ],
      },
    ],
    faq: [
      {
        q: {
          ru: "Где взять адрес токена?",
          en: "Where do I find the token address?",
          de: "Wo finde ich die Token-Adresse?",
          es: "¿Dónde encuentro la dirección del token?",
          zh: "在哪里找到代币地址？",
        },
        a: {
          ru: "На странице токена в pump.fun, Dexscreener, Birdeye или в кошельке Phantom — это строка из 32–44 символов (часто заканчивается на «pump» у токенов pump.fun).",
          en: "On the token page on pump.fun, Dexscreener, Birdeye or in the Phantom wallet — a 32–44 character string (pump.fun tokens often end with “pump”).",
          de: "Auf der Token-Seite bei pump.fun, Dexscreener, Birdeye oder in der Phantom-Wallet — eine Zeichenkette mit 32–44 Zeichen (pump.fun-Tokens enden oft auf „pump“).",
          es: "En la página del token en pump.fun, Dexscreener, Birdeye o en la wallet Phantom: una cadena de 32 a 44 caracteres (los tokens de pump.fun suelen terminar en «pump»).",
          zh: "在 pump.fun、Dexscreener、Birdeye 的代币页面或 Phantom 钱包中——一串 32–44 个字符的字符串（pump.fun 代币通常以 “pump” 结尾）。",
        },
      },
      noAdvice,
      free,
    ],
  },
  {
    slug: "robinhood-chain-token-scanner",
    chain: "Robinhood Chain",
    title: {
      ru: "Сканер токенов Robinhood Chain — проверка контракта, ликвидности и держателей",
      en: "Robinhood Chain token scanner — contract, liquidity and holder checks",
      de: "Robinhood-Chain-Token-Scanner — Contract, Liquidität und Holder prüfen",
      es: "Escáner de tokens de Robinhood Chain — revisión de contrato, liquidez y holders",
      zh: "Robinhood Chain 代币扫描器——检查合约、流动性和持有人",
    },
    description: {
      ru: "Независимая проверка токенов Robinhood Chain (chain id 4663): привилегии контракта, пулы Uniswap v4, проскальзывание, держатели, действия деплойера, тезисы авторов Fomo и их сделки.",
      en: "Independent checks for Robinhood Chain tokens (chain id 4663): contract privileges, Uniswap v4 pools, price impact, holders, deployer activity, Fomo authors’ theses and their trades.",
      de: "Unabhängige Prüfungen für Tokens auf Robinhood Chain (Chain-ID 4663): Contract-Berechtigungen, Uniswap-v4-Pools, Preiseinfluss, Holder, Aktivität des Deployers, Thesen von Fomo-Autoren und ihre Trades.",
      es: "Revisiones independientes de tokens de Robinhood Chain (chain id 4663): privilegios del contrato, pools de Uniswap v4, impacto en el precio, holders, actividad del deployer, tesis de autores de Fomo y sus operaciones.",
      zh: "独立检查 Robinhood Chain（链 ID 4663）代币：合约特权、Uniswap v4 池、价格影响、持有人、部署者动态、Fomo 作者的观点及其交易。",
    },
    h1: {
      ru: "Сканер токенов Robinhood Chain",
      en: "Robinhood Chain token scanner",
      de: "Robinhood-Chain-Token-Scanner",
      es: "Escáner de tokens de Robinhood Chain",
      zh: "Robinhood Chain 代币扫描器",
    },
    lead: {
      ru: "Robinhood Chain — новая сеть, и большинства привычных инструментов проверки для неё ещё нет. QUVR Pulse читает контракт, пулы и держателей прямо из блокчейна и показывает четыре независимые оценки от 0 до 100.",
      en: "Robinhood Chain is new, and most familiar checking tools do not support it yet. QUVR Pulse reads the contract, pools and holders straight from the chain and shows four independent 0–100 scores.",
      de: "Robinhood Chain ist neu, und die meisten bekannten Prüf-Tools unterstützen sie noch nicht. QUVR Pulse liest Contract, Pools und Holder direkt aus der Chain und zeigt vier unabhängige Bewertungen von 0 bis 100.",
      es: "Robinhood Chain es nueva y la mayoría de las herramientas de revisión conocidas aún no la admiten. QUVR Pulse lee el contrato, los pools y los holders directamente de la cadena y muestra cuatro puntuaciones independientes de 0 a 100.",
      zh: "Robinhood Chain 是一条新链，大多数常见的检测工具还不支持它。QUVR Pulse 直接从链上读取合约、交易池和持有人，并给出四项相互独立的 0–100 评分。",
    },
    sections: [
      {
        h: {
          ru: "Что внутри отчёта",
          en: "What the report covers",
          de: "Was der Bericht abdeckt",
          es: "Qué cubre el informe",
          zh: "报告包含什么",
        },
        p: [
          {
            ru: "Безопасность контракта: владелец, прокси, mint, пауза, чёрные списки, комиссии — по байткоду и read-only пробам. Здоровье ликвидности: пулы Uniswap v4 через PoolManager, глубина, проскальзывание на $100–$10 000, возраст пула. Распределение: держатели без пулов и PoolManager, доля деплойера, возможно связанные кошельки. Социальный импульс: тезисы и сделки авторов Fomo — отдельно от риска.",
            en: "Contract safety: owner, proxy, mint, pause, blacklist and fees — from bytecode and read-only probes. Liquidity health: Uniswap v4 pools via the PoolManager, depth, price impact for $100–$10,000, pool age. Distribution: holders excluding pools and the PoolManager, deployer share, possibly related wallets. Social momentum: Fomo authors’ theses and trades — kept separate from risk.",
            de: "Contract-Sicherheit: Owner, Proxy, Mint, Pause, Blacklist und Gebühren — aus Bytecode und Read-only-Tests. Liquiditätslage: Uniswap-v4-Pools über den PoolManager, Tiefe, Preiseinfluss für 100–10.000 $, Pool-Alter. Verteilung: Holder ohne Pools und PoolManager, Anteil des Deployers, möglicherweise verbundene Wallets. Social-Momentum: Thesen und Trades von Fomo-Autoren — getrennt vom Risiko.",
            es: "Seguridad del contrato: propietario, proxy, mint, pausa, lista negra y comisiones, a partir del bytecode y pruebas de solo lectura. Salud de la liquidez: pools de Uniswap v4 vía PoolManager, profundidad, impacto en el precio de 100 a 10.000 $, antigüedad del pool. Distribución: holders sin pools ni PoolManager, cuota del deployer, wallets posiblemente vinculadas. Impulso social: tesis y operaciones de autores de Fomo, separado del riesgo.",
            zh: "合约安全性：所有者、代理、增发、暂停、黑名单和手续费——基于字节码与只读探测。流动性健康度：通过 PoolManager 读取 Uniswap v4 池、深度、100–10,000 美元的价格影响、池龄。持仓分布：剔除池子和 PoolManager 的持有人、部署者占比、可能关联的钱包。社交热度：Fomo 作者的观点与交易——与风险分开计算。",
          },
        ],
      },
      {
        h: {
          ru: "Алерты в Telegram",
          en: "Telegram alerts",
          de: "Telegram-Alerts",
          es: "Alertas de Telegram",
          zh: "Telegram 提醒",
        },
        p: [
          {
            ru: "Добавьте токен в наблюдение — и получайте уведомления о продажах деплойера, падении ликвидности, крупных продажах и изменении привилегий контракта.",
            en: "Add a token to your watchlist to get alerts on deployer sells, liquidity drops, large sells and contract privilege changes.",
            de: "Füge einen Token deiner Watchlist hinzu und erhalte Alerts bei Verkäufen des Deployers, sinkender Liquidität, großen Verkäufen und Änderungen der Contract-Berechtigungen.",
            es: "Añade un token a tu lista de seguimiento para recibir alertas de ventas del deployer, caídas de liquidez, ventas grandes y cambios en los privilegios del contrato.",
            zh: "将代币加入关注列表，即可在部署者卖出、流动性下降、大额卖出以及合约特权变更时收到提醒。",
          },
        ],
      },
    ],
    faq: [
      {
        q: {
          ru: "Это официальный сервис Robinhood?",
          en: "Is this an official Robinhood service?",
          de: "Ist das ein offizieller Robinhood-Dienst?",
          es: "¿Es un servicio oficial de Robinhood?",
          zh: "这是 Robinhood 的官方服务吗？",
        },
        a: {
          ru: "Нет. QUVR Pulse — независимый аналитический продукт, не связан с Robinhood или Fomo и не одобрен ими.",
          en: "No. QUVR Pulse is an independent analytics product and is not affiliated with or endorsed by Robinhood or Fomo.",
          de: "Nein. QUVR Pulse is an independent analytics product and is not affiliated with or endorsed by Robinhood or Fomo — ein unabhängiges Analyseprodukt ohne Verbindung zu Robinhood oder Fomo.",
          es: "No. QUVR Pulse is an independent analytics product and is not affiliated with or endorsed by Robinhood or Fomo: es un producto de análisis independiente sin relación con Robinhood ni Fomo.",
          zh: "不是。QUVR Pulse is an independent analytics product and is not affiliated with or endorsed by Robinhood or Fomo——这是独立的分析产品，与 Robinhood 或 Fomo 无关，也未获其背书。",
        },
      },
      noAdvice,
      free,
    ],
  },
  {
    slug: "methodology",
    chain: null,
    title: {
      ru: "Методика оценок QUVR Pulse — как считаются риски токена",
      en: "QUVR Pulse methodology — how token risk scores work",
      de: "QUVR-Pulse-Methodik — so funktionieren die Token-Risikobewertungen",
      es: "Metodología de QUVR Pulse — cómo funcionan las puntuaciones de riesgo",
      zh: "QUVR Pulse 方法论——代币风险评分如何计算",
    },
    description: {
      ru: "Как устроены четыре оценки 0–100, достоверность и покрытие данных, почему «Нет данных» не равно нулю и почему мы никогда не пишем «безопасно».",
      en: "How the four 0–100 scores, confidence and data coverage work, why “No data” is never zero, and why we never say “safe”.",
      de: "Wie die vier Bewertungen von 0–100, Verlässlichkeit und Datenabdeckung funktionieren, warum „Keine Daten“ nie null ist und warum wir nie „sicher“ sagen.",
      es: "Cómo funcionan las cuatro puntuaciones de 0 a 100, la fiabilidad y la cobertura de datos, por qué «Sin datos» nunca es cero y por qué nunca decimos «seguro».",
      zh: "四项 0–100 评分、可信度与数据覆盖率如何计算，为什么“暂无数据”绝不等于零，以及为什么我们从不说“安全”。",
    },
    h1: {
      ru: "Как мы оцениваем риск токена",
      en: "How we score token risk",
      de: "So bewerten wir das Token-Risiko",
      es: "Cómo puntuamos el riesgo de un token",
      zh: "我们如何评估代币风险",
    },
    lead: {
      ru: "Прозрачность важнее красивой цифры. Каждая оценка раскладывается на компоненты, у каждого значения есть источник и время обновления.",
      en: "Transparency beats a pretty number. Every score breaks down into components, and every value carries its source and update time.",
      de: "Transparenz schlägt eine schöne Zahl. Jede Bewertung zerlegt sich in Komponenten, und jeder Wert trägt seine Quelle und seinen Aktualisierungszeitpunkt.",
      es: "La transparencia vale más que un número bonito. Cada puntuación se desglosa en componentes y cada valor lleva su fuente y su hora de actualización.",
      zh: "透明比好看的数字更重要。每项评分都可拆解为多个组成部分，每个数值都标有来源和更新时间。",
    },
    sections: [
      {
        h: {
          ru: "Четыре независимые оценки",
          en: "Four independent scores",
          de: "Vier unabhängige Bewertungen",
          es: "Cuatro puntuaciones independientes",
          zh: "四项独立评分",
        },
        p: [
          {
            ru: "Безопасность контракта, здоровье ликвидности и распределение держателей описывают риск. Социальный импульс описывает внимание и в итоговый риск не входит: шум не делает токен надёжнее.",
            en: "Contract safety, liquidity health and holder distribution describe risk. Social momentum describes attention and is not part of the risk verdict: hype does not make a token more reliable.",
            de: "Contract-Sicherheit, Liquiditätslage und Holder-Verteilung beschreiben das Risiko. Social-Momentum beschreibt Aufmerksamkeit und fließt nicht ins Risikourteil ein: Hype macht einen Token nicht verlässlicher.",
            es: "La seguridad del contrato, la salud de la liquidez y la distribución de holders describen el riesgo. El impulso social describe la atención y no forma parte del veredicto de riesgo: el hype no hace más fiable un token.",
            zh: "合约安全性、流动性健康度和持仓分布描述风险。社交热度描述的是关注度，不计入风险结论：炒作不会让代币更可靠。",
          },
        ],
      },
      {
        h: {
          ru: "Достоверность и покрытие",
          en: "Confidence and coverage",
          de: "Verlässlichkeit und Abdeckung",
          es: "Fiabilidad y cobertura",
          zh: "可信度与覆盖率",
        },
        p: [
          {
            ru: "Если часть данных недоступна, компонент исключается из оценки, а покрытие и достоверность снижаются. Отсутствующие данные никогда не считаются нулём и никогда не дают «низкий риск».",
            en: "When some data is unavailable, that component is excluded, and coverage and confidence go down. Missing data is never counted as zero and never produces “low risk”.",
            de: "Wenn Daten fehlen, wird die jeweilige Komponente ausgeschlossen, und Abdeckung sowie Verlässlichkeit sinken. Fehlende Daten zählen nie als null und führen nie zu „geringem Risiko“.",
            es: "Si faltan datos, ese componente se excluye y bajan la cobertura y la fiabilidad. Los datos que faltan nunca cuentan como cero ni dan como resultado «riesgo bajo».",
            zh: "当部分数据不可用时，相应组成部分会被排除，覆盖率和可信度随之下降。缺失的数据绝不按零计算，也绝不会得出“低风险”。",
          },
        ],
      },
      {
        h: {
          ru: "Что именно проверяется",
          en: "What exactly is checked",
          de: "Was genau geprüft wird",
          es: "Qué se comprueba exactamente",
          zh: "具体检查哪些内容",
        },
        p: [
          {
            ru: "Контракт: какие функции есть в байткоде и кто может их вызвать — выпуск новых токенов, комиссии, чёрный список, пауза, прокси с возможностью замены кода; верифицирован ли исходный код. Отдельно симулируем покупку и продажу (eth_call, без транзакций), чтобы увидеть, не блокируется ли продажа.",
            en: "Contract: which functions exist in the bytecode and who can call them — minting, fees, blacklist, pause, upgradeable proxy; whether the source is verified. We also simulate a buy and a sell (eth_call, no transactions) to see whether selling is blocked.",
            de: "Contract: welche Funktionen im Bytecode stehen und wer sie aufrufen darf — Minting, Gebühren, Blacklist, Pause, upgradebarer Proxy; ob der Quellcode verifiziert ist. Zusätzlich simulieren wir Kauf und Verkauf (eth_call, ohne Transaktionen), um zu sehen, ob Verkäufe blockiert werden.",
            es: "Contrato: qué funciones hay en el bytecode y quién puede llamarlas — emisión, comisiones, lista negra, pausa, proxy actualizable; si el código fuente está verificado. También simulamos una compra y una venta (eth_call, sin transacciones) para ver si la venta está bloqueada.",
            zh: "合约：字节码中有哪些函数、谁能调用——增发、手续费、黑名单、暂停、可升级代理；源码是否已验证。我们还会模拟买入和卖出（eth_call，不发送交易），查看卖出是否被阻止。",
          },
          {
            ru: "Ликвидность: все пулы токена, доля основного пула, насколько сдвинет цену продажа на $100, $1 000 и $5 000, отношение ликвидности к капитализации, возраст пула.",
            en: "Liquidity: all pools, the main pool's share, how far a $100, $1,000 and $5,000 sell would move the price, liquidity-to-market-cap ratio, pool age.",
            de: "Liquidität: alle Pools, Anteil des Hauptpools, wie stark ein Verkauf über $100, $1.000 und $5.000 den Kurs bewegen würde, Verhältnis Liquidität zu Marktkapitalisierung, Alter des Pools.",
            es: "Liquidez: todos los pools, la cuota del pool principal, cuánto movería el precio una venta de $100, $1.000 y $5.000, relación liquidez/capitalización, antigüedad del pool.",
            zh: "流动性：所有池子、主池占比、卖出 $100、$1,000 和 $5,000 对价格的影响、流动性与市值之比、池子存续时间。",
          },
          {
            ru: "Держатели: концентрация без пулов и адресов сжигания, доля создателя, новые кошельки, возможно связанные кошельки (общий источник финансирования и переводы между ними), действия создателя. Плюс копии тикера — другие токены с тем же названием.",
            en: "Holders: concentration excluding pools and burn addresses, creator share, fresh wallets, possibly related wallets (common funding source and transfers between them), creator activity. Plus ticker clones — other tokens using the same name.",
            de: "Holder: Konzentration ohne Pools und Burn-Adressen, Anteil des Creators, frische Wallets, möglicherweise verbundene Wallets (gemeinsame Finanzierungsquelle und Transfers untereinander), Aktivität des Creators. Dazu Ticker-Klone — andere Tokens mit demselben Namen.",
            es: "Holders: concentración sin pools ni direcciones de quemado, cuota del creador, wallets nuevas, wallets posiblemente vinculadas (misma fuente de financiación y transferencias entre ellas), actividad del creador. Además, clones del ticker: otros tokens con el mismo nombre.",
            zh: "持有人：排除池子和销毁地址后的集中度、创建者占比、新钱包、可能关联的钱包（共同资金来源及相互转账）、创建者操作。另有同名代码克隆——使用相同名称的其他代币。",
          },
        ],
      },
      {
        h: {
          ru: "Источники данных",
          en: "Data sources",
          de: "Datenquellen",
          es: "Fuentes de datos",
          zh: "数据来源",
        },
        p: [
          {
            ru: "Публичные RPC-узлы каждой сети (байткод, балансы, переводы, симуляция), Blockscout (исходный код, создатель, держатели), Dexscreener и GeckoTerminal (пулы, цена, свечи), для Solana — RPC и Helius, для социальных данных Robinhood Chain — Fomo. Мы только читаем данные: кошелёк не нужен, транзакции не отправляются.",
            en: "Public RPC nodes of each chain (bytecode, balances, transfers, simulation), Blockscout (source code, creator, holders), Dexscreener and GeckoTerminal (pools, price, candles), Solana RPC and Helius, and Fomo for Robinhood Chain social data. We only read: no wallet, no transactions.",
            de: "Öffentliche RPC-Knoten jeder Chain (Bytecode, Salden, Transfers, Simulation), Blockscout (Quellcode, Creator, Holder), Dexscreener und GeckoTerminal (Pools, Preis, Kerzen), für Solana RPC und Helius, für Social-Daten auf Robinhood Chain Fomo. Wir lesen nur: keine Wallet, keine Transaktionen.",
            es: "Nodos RPC públicos de cada red (bytecode, saldos, transferencias, simulación), Blockscout (código fuente, creador, holders), Dexscreener y GeckoTerminal (pools, precio, velas), RPC y Helius para Solana, y Fomo para los datos sociales de Robinhood Chain. Solo leemos: sin wallet ni transacciones.",
            zh: "各链的公共 RPC 节点（字节码、余额、转账、模拟）、Blockscout（源码、创建者、持有人）、Dexscreener 与 GeckoTerminal（池子、价格、K 线）、Solana 使用 RPC 与 Helius，Robinhood Chain 的社交数据来自 Fomo。我们只读取数据：无需钱包，不发送交易。",
          },
        ],
      },
      {
        h: {
          ru: "Какие сети и насколько полно",
          en: "Chains and coverage",
          de: "Chains und Abdeckung",
          es: "Redes y cobertura",
          zh: "支持的链与覆盖程度",
        },
        p: [
          {
            ru: "Robinhood Chain — полная проверка: история переводов восстанавливается с момента создания токена. Solana — права mint и freeze, расширения Token-2022, держатели и пулы. Base — контракт, ликвидность и держатели из списка Blockscout; рост числа держателей, новые кошельки, массовые рассылки и действия создателя для Base пока помечены «Нет данных».",
            en: "Robinhood Chain — full check: transfer history is replayed from the token's creation. Solana — mint and freeze authorities, Token-2022 extensions, holders and pools. Base — contract, liquidity and holders from the Blockscout list; holder growth, new wallets, mass transfers and creator activity are marked “No data” on Base for now.",
            de: "Robinhood Chain — vollständiger Check: Die Transfer-Historie wird ab Erstellung des Tokens nachgespielt. Solana — Mint- und Freeze-Rechte, Token-2022-Erweiterungen, Holder und Pools. Base — Contract, Liquidität und Holder aus der Blockscout-Liste; Holder-Wachstum, neue Wallets, Massentransfers und Creator-Aktivität sind auf Base vorerst „Keine Daten“.",
            es: "Robinhood Chain — revisión completa: el historial de transferencias se reconstruye desde la creación del token. Solana — autoridades de mint y freeze, extensiones Token-2022, holders y pools. Base — contrato, liquidez y holders de la lista de Blockscout; crecimiento de holders, wallets nuevas, envíos masivos y actividad del creador figuran como «Sin datos» en Base por ahora.",
            zh: "Robinhood Chain——完整检查：从代币创建起回放全部转账历史。Solana——mint 与 freeze 权限、Token-2022 扩展、持有人和池子。Base——合约、流动性以及来自 Blockscout 列表的持有人；持有人增长、新钱包、批量转账和创建者操作在 Base 上暂标为“暂无数据”。",
          },
        ],
      },
      {
        h: {
          ru: "Мы проверяем сами себя",
          en: "We check ourselves",
          de: "Wir prüfen uns selbst",
          es: "Nos comprobamos a nosotros mismos",
          zh: "我们检验自己",
        },
        p: [
          {
            ru: "Для каждого токена мы запоминаем оценку при первой проверке и через 1 час, 24 часа и 7 дней смотрим, что с ним стало. Результаты — на странице «Точность оценок» (Track record), включая неудобные цифры.",
            en: "For every token we record the label at the first check and look again after 1 hour, 24 hours and 7 days. Results are on the Track record page, including the inconvenient numbers.",
            de: "Für jeden Token speichern wir das Urteil beim ersten Check und sehen nach 1 Stunde, 24 Stunden und 7 Tagen erneut nach. Die Ergebnisse stehen auf der Seite „Track record“ — auch die unbequemen Zahlen.",
            es: "Para cada token guardamos la etiqueta en la primera revisión y volvemos a mirar tras 1 hora, 24 horas y 7 días. Los resultados están en la página Track record, incluidas las cifras incómodas.",
            zh: "对每个代币，我们在首次检查时记录判断，并在 1 小时、24 小时和 7 天后再次查看。结果公布在“准确度记录”（Track record）页面，包括不好看的数字。",
          },
        ],
      },
      {
        h: {
          ru: "Формулировки",
          en: "Wording",
          de: "Formulierungen",
          es: "Terminología",
          zh: "措辞",
        },
        p: [
          {
            ru: "Итог — «Низкий обнаруженный риск», «Повышенный риск», «Высокий риск» или «Недостаточно данных». Слова «безопасно» нет намеренно: проверка находит известные признаки риска, но не может доказать их отсутствие.",
            en: "The verdict is “Low detected risk”, “Elevated risk”, “High risk” or “Insufficient data”. The word “safe” is deliberately absent: a check finds known risk signs but cannot prove their absence.",
            de: "Das Urteil lautet „Geringes erkanntes Risiko“, „Erhöhtes Risiko“, „Hohes Risiko“ oder „Zu wenige Daten“. Das Wort „sicher“ fehlt bewusst: Eine Prüfung findet bekannte Risikomerkmale, kann aber deren Abwesenheit nicht beweisen.",
            es: "El veredicto es «Riesgo detectado bajo», «Riesgo elevado», «Riesgo alto» o «Datos insuficientes». La palabra «seguro» falta a propósito: una revisión encuentra señales de riesgo conocidas, pero no puede demostrar su ausencia.",
            zh: "结论只有“检出风险较低”“风险偏高”“高风险”或“数据不足”四种。我们刻意不使用“安全”一词：检查能发现已知的风险迹象，却无法证明它们不存在。",
          },
        ],
      },
    ],
    faq: [noAdvice, free],
  },
];

export function landingBySlug(slug: string): Landing | undefined {
  return LANDINGS.find((l) => l.slug === slug);
}
