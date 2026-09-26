/**
 * "Learn" glossary: one short, honest explainer per term people see in reports and search for.
 * Every text exists in all five languages. Wording rules: no "safe" verdicts, no buy/sell advice,
 * wallet links are "possibly related".
 */
export type T5 = { ru: string; en: string; de: string; es: string; zh: string };
const L = (ru: string, en: string, de: string, es: string, zh: string): T5 => ({
  ru,
  en,
  de,
  es,
  zh,
});

export type Term = {
  slug: string;
  /** Finding codes (exact or prefix ending with ".") that link to this term from reports. */
  codes: string[];
  title: T5;
  description: T5;
  h1: T5;
  short: T5;
  sections: Array<{ h: T5; p: T5 }>;
  check: T5;
  faq: Array<{ q: T5; a: T5 }>;
};

const H_WHY = L(
  "Почему это важно",
  "Why it matters",
  "Warum das wichtig ist",
  "Por qué importa",
  "为什么重要",
);
const H_HOW = L(
  "Как это выглядит на практике",
  "What it looks like in practice",
  "Wie das in der Praxis aussieht",
  "Cómo se ve en la práctica",
  "实际表现",
);

export const TERMS: Term[] = [
  {
    slug: "mint-authority",
    codes: ["contract.mint", "solana.mint-authority", "solana.authorities-revoked"],
    title: L(
      "Mint authority: что это и почему это риск для держателей токена",
      "Mint authority: what it is and why it matters for token holders",
      "Mint Authority: was das ist und warum sie für Token-Holder wichtig ist",
      "Mint authority: qué es y por qué importa a los holders",
      "Mint 权限：是什么，为什么对持有人很重要",
    ),
    description: L(
      "Mint authority — право выпускать новые токены. Если оно не отозвано, создатель может допечатать монеты и обесценить ваши. Как проверить за секунды.",
      "Mint authority is the power to create new tokens. If it is not revoked, the creator can print more and dilute your share. How to check it in seconds.",
      "Die Mint Authority erlaubt es, neue Tokens zu erzeugen. Ist sie nicht entzogen, kann der Creator nachdrucken und deinen Anteil verwässern. So prüfst du das in Sekunden.",
      "La mint authority permite crear tokens nuevos. Si no está revocada, el creador puede emitir más y diluir tu parte. Cómo comprobarlo en segundos.",
      "Mint 权限即增发新代币的权力。若未撤销，创建者可以随时增发并稀释你的持仓。几秒钟即可检查。",
    ),
    h1: L(
      "Mint authority (право выпуска)",
      "Mint authority",
      "Mint Authority (Prägerecht)",
      "Mint authority (derecho de emisión)",
      "Mint 权限（增发权）",
    ),
    short: L(
      "Право создавать новые токены. Пока оно у кого-то есть, общее количество монет может вырасти в любой момент.",
      "The power to create new tokens. As long as someone holds it, the total supply can grow at any moment.",
      "Das Recht, neue Tokens zu erzeugen. Solange jemand es hat, kann das Gesamtangebot jederzeit wachsen.",
      "El poder de crear tokens nuevos. Mientras alguien lo tenga, el suministro total puede crecer en cualquier momento.",
      "创建新代币的权力。只要有人持有它，总供应量随时可能增加。",
    ),
    sections: [
      {
        h: H_WHY,
        p: L(
          "Если создатель может выпустить ещё миллиард токенов и продать их в пул, цена рухнет, а ваша доля обесценится. Это один из самых простых способов забрать деньги у покупателей.",
          "If the creator can mint another billion tokens and sell them into the pool, the price collapses and your share is diluted. It is one of the simplest ways to take buyers' money.",
          "Kann der Creator eine weitere Milliarde Tokens prägen und in den Pool verkaufen, bricht der Kurs ein und dein Anteil wird verwässert. Das ist einer der einfachsten Wege, Käufern Geld abzunehmen.",
          "Si el creador puede emitir otros mil millones de tokens y venderlos en el pool, el precio se desploma y tu parte se diluye. Es una de las formas más simples de quitar dinero a los compradores.",
          "如果创建者能再增发十亿枚代币并卖进池子，价格会崩溃，你的持仓会被稀释。这是从买家手里拿钱最简单的方式之一。",
        ),
      },
      {
        h: H_HOW,
        p: L(
          "На Solana у каждого токена есть поле mint authority: если оно пустое (отозвано), новых монет не будет никогда. У pump.fun-токенов оно отзывается автоматически. В EVM-сетях (Robinhood Chain) право выпуска зашито в код контракта — важно, кто им управляет и отказался ли владелец от прав.",
          "On Solana every token has a mint authority field: if it is empty (revoked), no new coins can ever be created. pump.fun tokens revoke it automatically. On EVM chains (Robinhood Chain) minting lives in the contract code — what matters is who controls it and whether the owner renounced it.",
          "Auf Solana hat jeder Token ein Mint-Authority-Feld: Ist es leer (entzogen), können nie neue Coins entstehen. pump.fun-Tokens entziehen es automatisch. Auf EVM-Chains (Robinhood Chain) steckt das Minten im Contract-Code — entscheidend ist, wer es kontrolliert und ob der Owner verzichtet hat.",
          "En Solana cada token tiene un campo mint authority: si está vacío (revocado), nunca se podrán crear monedas nuevas. Los tokens de pump.fun lo revocan automáticamente. En redes EVM (Robinhood Chain) la emisión vive en el código del contrato: importa quién la controla y si el propietario renunció.",
          "在 Solana 上，每个代币都有 mint authority 字段：若为空（已撤销），就永远不能再增发。pump.fun 代币会自动撤销。在 EVM 链（Robinhood Chain）上，增发写在合约代码里——关键是谁在控制，以及所有者是否已放弃权限。",
        ),
      },
    ],
    check: L(
      "QUVR Pulse читает mint-аккаунт Solana напрямую, а у EVM-контрактов проверяет байткод и делает read-only пробы от имени владельца. Результат — в блоке «Контракт» отчёта.",
      "QUVR Pulse reads the Solana mint account directly and, for EVM contracts, checks the bytecode and runs read-only probes as the owner. The result is in the report's Contract section.",
      "QUVR Pulse liest den Solana-Mint-Account direkt und prüft bei EVM-Contracts den Bytecode mit Read-only-Tests aus Sicht des Owners. Das Ergebnis steht im Bereich „Contract“ des Berichts.",
      "QUVR Pulse lee directamente la cuenta del mint en Solana y, en contratos EVM, revisa el bytecode y hace pruebas de solo lectura como propietario. El resultado está en la sección «Contrato» del informe.",
      "QUVR Pulse 直接读取 Solana 的 mint 账户；对 EVM 合约则检查字节码，并以所有者身份做只读探测。结果显示在报告的“合约”部分。",
    ),
    faq: [
      {
        q: L(
          "Отозванная mint authority — гарантия?",
          "Is a revoked mint authority a guarantee?",
          "Ist eine entzogene Mint Authority eine Garantie?",
          "¿Una mint authority revocada es una garantía?",
          "撤销了 mint 权限就有保障吗？",
        ),
        a: L(
          "Нет. Это убирает один конкретный риск, но цена всё равно может упасть из-за продаж крупных держателей или тонкой ликвидности.",
          "No. It removes one specific risk, but the price can still fall because of large holders selling or thin liquidity.",
          "Nein. Es beseitigt ein bestimmtes Risiko, aber der Kurs kann trotzdem durch Verkäufe großer Holder oder dünne Liquidität fallen.",
          "No. Elimina un riesgo concreto, pero el precio aún puede caer por ventas de grandes holders o liquidez escasa.",
          "不是。它只消除了一种具体风险，价格仍可能因大户抛售或流动性薄弱而下跌。",
        ),
      },
    ],
  },
  {
    slug: "freeze-authority",
    codes: ["solana.freeze-authority", "solana.default-frozen", "contract.blacklist"],
    title: L(
      "Freeze authority на Solana: могут ли заморозить ваши токены",
      "Freeze authority on Solana: can your tokens be frozen?",
      "Freeze Authority auf Solana: Können deine Tokens eingefroren werden?",
      "Freeze authority en Solana: ¿pueden congelar tus tokens?",
      "Solana 的冻结权限：你的代币会被冻结吗？",
    ),
    description: L(
      "Freeze authority позволяет заморозить токены в любом кошельке — после этого их нельзя ни продать, ни перевести. Что это значит и как проверить.",
      "Freeze authority lets someone freeze the tokens in any wallet — after that you can neither sell nor transfer them. What it means and how to check it.",
      "Mit der Freeze Authority lassen sich Tokens in jeder Wallet einfrieren — danach kannst du sie weder verkaufen noch übertragen. Was das bedeutet und wie du es prüfst.",
      "La freeze authority permite congelar los tokens de cualquier wallet: después no puedes venderlos ni transferirlos. Qué significa y cómo comprobarlo.",
      "冻结权限可以冻结任意钱包中的代币——之后你既不能卖出也不能转账。含义及检查方法。",
    ),
    h1: L(
      "Freeze authority (право заморозки)",
      "Freeze authority",
      "Freeze Authority (Einfrierrecht)",
      "Freeze authority (derecho de congelación)",
      "冻结权限（Freeze authority）",
    ),
    short: L(
      "Право заморозить токены в чужом кошельке. Замороженные токены нельзя продать.",
      "The power to freeze tokens in someone else's wallet. Frozen tokens cannot be sold.",
      "Das Recht, Tokens in fremden Wallets einzufrieren. Eingefrorene Tokens lassen sich nicht verkaufen.",
      "El poder de congelar tokens en la wallet de otra persona. Los tokens congelados no se pueden vender.",
      "冻结他人钱包中代币的权力。被冻结的代币无法卖出。",
    ),
    sections: [
      {
        h: H_WHY,
        p: L(
          "Классическая схема: покупателям дают купить, потом замораживают их кошельки, а продать может только создатель. Снаружи график выглядит живым, но выйти невозможно.",
          "A classic scheme: buyers are allowed to buy, then their wallets are frozen and only the creator can sell. From outside the chart looks alive, but there is no exit.",
          "Ein klassisches Muster: Käufer dürfen kaufen, dann werden ihre Wallets eingefroren und nur der Creator kann verkaufen. Von außen wirkt der Chart lebendig, aber es gibt keinen Ausstieg.",
          "Un esquema clásico: dejan comprar, luego congelan las wallets de los compradores y solo el creador puede vender. Desde fuera el gráfico parece vivo, pero no hay salida.",
          "经典套路：先让买家买入，再冻结他们的钱包，只有创建者能卖出。从外面看走势很活跃，但根本出不去。",
        ),
      },
      {
        h: H_HOW,
        p: L(
          "У токенов SPL и Token-2022 есть поле freeze authority. Пустое поле значит, что заморозить нельзя. У стейблкоинов оно обычно есть — эмитенты замораживают украденные средства. У мемкоина причин держать его почти нет. В EVM-контрактах похожую роль играет чёрный список адресов.",
          "SPL and Token-2022 tokens have a freeze authority field. Empty means nothing can be frozen. Stablecoins usually keep it — issuers freeze stolen funds. A memecoin has almost no reason to. In EVM contracts an address blacklist plays a similar role.",
          "SPL- und Token-2022-Tokens haben ein Freeze-Authority-Feld. Leer heißt: Nichts kann eingefroren werden. Stablecoins behalten es meist — Emittenten frieren gestohlene Gelder ein. Ein Memecoin hat kaum einen Grund dafür. In EVM-Contracts erfüllt eine Adress-Blacklist eine ähnliche Rolle.",
          "Los tokens SPL y Token-2022 tienen un campo freeze authority. Vacío significa que no se puede congelar nada. Las stablecoins suelen mantenerlo: los emisores congelan fondos robados. Una memecoin casi no tiene motivo para ello. En contratos EVM una lista negra de direcciones cumple un papel similar.",
          "SPL 和 Token-2022 代币都有 freeze authority 字段。为空表示无法冻结。稳定币通常保留它——发行方会冻结被盗资金。Memecoin 几乎没有理由保留。在 EVM 合约中，地址黑名单起类似作用。",
        ),
      },
    ],
    check: L(
      "QUVR Pulse читает freeze authority прямо из mint-аккаунта и отдельно отмечает расширение Token-2022 «default frozen», при котором новые кошельки заморожены по умолчанию.",
      "QUVR Pulse reads the freeze authority straight from the mint account and separately flags the Token-2022 “default frozen” extension, which freezes new wallets by default.",
      "QUVR Pulse liest die Freeze Authority direkt aus dem Mint-Account und markiert zusätzlich die Token-2022-Erweiterung „default frozen“, die neue Wallets standardmäßig einfriert.",
      "QUVR Pulse lee la freeze authority directamente de la cuenta del mint y marca aparte la extensión Token-2022 «default frozen», que congela las wallets nuevas por defecto.",
      "QUVR Pulse 直接从 mint 账户读取冻结权限，并单独标记 Token-2022 的 “default frozen” 扩展——该扩展会默认冻结新钱包。",
    ),
    faq: [
      {
        q: L(
          "У pump.fun-токенов бывает freeze authority?",
          "Do pump.fun tokens have a freeze authority?",
          "Haben pump.fun-Tokens eine Freeze Authority?",
          "¿Los tokens de pump.fun tienen freeze authority?",
          "pump.fun 代币会有冻结权限吗？",
        ),
        a: L(
          "Нет: pump.fun создаёт токены с уже отозванными mint и freeze authority. Если вы видите их у токена, он создан не через pump.fun.",
          "No: pump.fun creates tokens with mint and freeze authority already revoked. If you see them on a token, it was not launched via pump.fun.",
          "Nein: pump.fun erstellt Tokens mit bereits entzogener Mint- und Freeze Authority. Siehst du sie bei einem Token, wurde er nicht über pump.fun gestartet.",
          "No: pump.fun crea tokens con la mint y la freeze authority ya revocadas. Si las ves en un token, no se lanzó con pump.fun.",
          "不会：pump.fun 创建的代币默认已撤销 mint 和冻结权限。如果某个代币还有这些权限，它就不是通过 pump.fun 发行的。",
        ),
      },
    ],
  },
  {
    slug: "honeypot",
    codes: [
      "contract.sell-simulation-failed",
      "contract.transfer-restriction",
      "contract.trading-toggle",
      "contract.max-wallet-tx",
      "contract.fee-change",
    ],
    title: L(
      "Honeypot-токен: как понять, что монету нельзя продать",
      "Honeypot token: how to tell you won't be able to sell",
      "Honeypot-Token: So erkennst du, dass du nicht verkaufen kannst",
      "Token honeypot: cómo saber que no podrás vender",
      "貔貅盘代币：如何判断买了卖不掉",
    ),
    description: L(
      "Honeypot — токен, который можно купить, но нельзя продать: блокировка продаж, 100% комиссия, чёрный список. Признаки и как проверить до покупки.",
      "A honeypot is a token you can buy but cannot sell: blocked sells, a 100% sell tax, a blacklist. The signs and how to check before you buy.",
      "Ein Honeypot ist ein Token, den du kaufen, aber nicht verkaufen kannst: gesperrte Verkäufe, 100 % Verkaufssteuer, Blacklist. Die Anzeichen und wie du vor dem Kauf prüfst.",
      "Un honeypot es un token que puedes comprar pero no vender: ventas bloqueadas, impuesto del 100 %, lista negra. Las señales y cómo comprobarlo antes de comprar.",
      "貔貅盘是能买不能卖的代币：禁止卖出、100% 卖出税、黑名单。识别特征及买入前的检查方法。",
    ),
    h1: L(
      "Honeypot: купить можно, продать нельзя",
      "Honeypot: you can buy, you can't sell",
      "Honeypot: Kaufen ja, Verkaufen nein",
      "Honeypot: puedes comprar, no puedes vender",
      "貔貅盘：能买，不能卖",
    ),
    short: L(
      "Токен, в коде которого продажа заблокирована или облагается почти 100% комиссией. Деньги заходят, но не выходят.",
      "A token whose code blocks selling or taxes it at close to 100%. Money goes in but cannot come out.",
      "Ein Token, dessen Code Verkäufe sperrt oder mit fast 100 % besteuert. Geld geht rein, kommt aber nicht raus.",
      "Un token cuyo código bloquea la venta o la grava casi al 100 %. El dinero entra pero no sale.",
      "代码中禁止卖出或收取接近 100% 卖出税的代币。钱进得去，出不来。",
    ),
    sections: [
      {
        h: H_WHY,
        p: L(
          "Honeypot выглядит как обычный растущий токен: покупки проходят, график идёт вверх. Проблема обнаруживается только при попытке продать — и тогда уже поздно.",
          "A honeypot looks like a normal rising token: buys go through and the chart climbs. The problem only shows up when you try to sell — and by then it is too late.",
          "Ein Honeypot sieht aus wie ein normaler steigender Token: Käufe gehen durch, der Chart steigt. Das Problem zeigt sich erst beim Verkaufsversuch — dann ist es zu spät.",
          "Un honeypot parece un token normal que sube: las compras pasan y el gráfico sube. El problema aparece solo al intentar vender, y entonces ya es tarde.",
          "貔貅盘看起来像正常上涨的代币：买入顺利，走势向上。只有在卖出时才发现问题——那时已经太晚了。",
        ),
      },
      {
        h: H_HOW,
        p: L(
          "Типичные механизмы в EVM-контрактах: функция, включающая и выключающая торговлю; комиссия на продажу, которую владелец может поднять до 100%; чёрный список, куда автоматически попадают покупатели; ограничение суммы продажи. Поиск этих функций по названиям ненадёжен — код можно назвать как угодно.",
          "Typical mechanisms in EVM contracts: a function that turns trading on and off; a sell tax the owner can raise to 100%; a blacklist buyers are added to automatically; a cap on sell amounts. Searching for these functions by name is unreliable — code can be named anything.",
          "Typische Mechanismen in EVM-Contracts: eine Funktion, die den Handel an- und ausschaltet; eine Verkaufssteuer, die der Owner auf 100 % erhöhen kann; eine Blacklist, auf die Käufer automatisch kommen; ein Limit für Verkaufsmengen. Die Suche nach Funktionsnamen ist unzuverlässig — Code kann beliebig benannt sein.",
          "Mecanismos típicos en contratos EVM: una función que activa y desactiva el trading; un impuesto de venta que el propietario puede subir al 100 %; una lista negra a la que se añaden compradores automáticamente; un límite a la cantidad de venta. Buscar estas funciones por nombre no es fiable: el código puede llamarse como sea.",
          "EVM 合约中的典型机制：开关交易的函数；所有者可把卖出税调到 100%；自动把买家加入黑名单；限制卖出数量。按函数名搜索并不可靠——代码可以随意命名。",
        ),
      },
    ],
    check: L(
      "QUVR Pulse не полагается на названия функций: он сверяет байткод, делает read-only пробы от имени владельца и симулирует покупку и продажу без отправки транзакций. Если симуляция невозможна, отчёт честно пишет «Sell simulation unavailable».",
      "QUVR Pulse does not rely on function names: it checks the bytecode, runs read-only probes as the owner and simulates a buy and a sell without sending transactions. When simulation is impossible, the report says “Sell simulation unavailable”.",
      "QUVR Pulse verlässt sich nicht auf Funktionsnamen: Es prüft den Bytecode, führt Read-only-Tests aus Sicht des Owners aus und simuliert Kauf und Verkauf, ohne Transaktionen zu senden. Ist keine Simulation möglich, steht im Bericht „Sell simulation unavailable“.",
      "QUVR Pulse no se fía de los nombres de funciones: revisa el bytecode, hace pruebas de solo lectura como propietario y simula una compra y una venta sin enviar transacciones. Si la simulación no es posible, el informe dice «Sell simulation unavailable».",
      "QUVR Pulse 不依赖函数名：它检查字节码，以所有者身份做只读探测，并在不发送交易的情况下模拟买入和卖出。无法模拟时，报告会如实显示 “Sell simulation unavailable”。",
    ),
    faq: [
      {
        q: L(
          "Бывают honeypot на Solana?",
          "Are there honeypots on Solana?",
          "Gibt es Honeypots auf Solana?",
          "¿Hay honeypots en Solana?",
          "Solana 上有貔貅盘吗？",
        ),
        a: L(
          "Реже, чем в EVM, но бывают: через freeze authority, расширение transfer hook или permanent delegate у Token-2022. У токенов pump.fun этих механизмов нет.",
          "Less often than on EVM, but yes: via freeze authority, the transfer hook extension or a permanent delegate on Token-2022. pump.fun tokens do not have these.",
          "Seltener als auf EVM, aber ja: über Freeze Authority, die Transfer-Hook-Erweiterung oder einen Permanent Delegate bei Token-2022. pump.fun-Tokens haben das nicht.",
          "Menos que en EVM, pero sí: mediante freeze authority, la extensión transfer hook o un permanent delegate en Token-2022. Los tokens de pump.fun no los tienen.",
          "比 EVM 少，但确实存在：通过冻结权限、Token-2022 的 transfer hook 扩展或 permanent delegate 实现。pump.fun 代币没有这些机制。",
        ),
      },
    ],
  },
  {
    slug: "rug-pull",
    codes: [],
    title: L(
      "Rug pull: что это такое и какие признаки видны заранее",
      "Rug pull: what it is and which signs are visible in advance",
      "Rug Pull: Was das ist und welche Anzeichen man vorher sieht",
      "Rug pull: qué es y qué señales se ven de antemano",
      "Rug pull（跑路）：是什么，哪些迹象可以提前发现",
    ),
    description: L(
      "Rug pull — когда создатели токена забирают деньги покупателей: выводят ликвидность, продают свою долю или допечатывают монеты. Типы и признаки.",
      "A rug pull is when token creators take buyers' money: they pull liquidity, dump their share or mint more coins. The types and the warning signs.",
      "Ein Rug Pull liegt vor, wenn Token-Creator das Geld der Käufer nehmen: Liquidität abziehen, ihren Anteil abverkaufen oder nachprägen. Arten und Warnsignale.",
      "Un rug pull es cuando los creadores de un token se quedan con el dinero de los compradores: retiran liquidez, venden su parte o emiten más. Tipos y señales.",
      "Rug pull 指代币创建者卷走买家的钱：撤走流动性、抛售自己的份额或增发代币。类型与预警信号。",
    ),
    h1: L("Rug pull (выдернуть ковёр)", "Rug pull", "Rug Pull", "Rug pull", "Rug pull（跑路）"),
    short: L(
      "Ситуация, когда создатели или крупные держатели токена разом забирают деньги покупателей, и цена падает почти до нуля.",
      "When a token's creators or large holders take buyers' money in one move and the price drops close to zero.",
      "Wenn die Creator oder großen Holder eines Tokens das Geld der Käufer auf einen Schlag nehmen und der Kurs fast auf null fällt.",
      "Cuando los creadores o grandes holders de un token se llevan de golpe el dinero de los compradores y el precio cae casi a cero.",
      "代币创建者或大户一次性卷走买家的钱，价格几乎跌到零。",
    ),
    sections: [
      {
        h: L(
          "Три основных вида",
          "Three main types",
          "Drei Hauptarten",
          "Tres tipos principales",
          "三种主要类型",
        ),
        p: L(
          "1) Вывод ликвидности: создатель забирает деньги из пула, и продать становится некому. 2) Сброс доли: создатель или связанные кошельки продают крупный пакет в тонкий пул. 3) Злоупотребление правами контракта: допечатка токенов, заморозка, 100% комиссия на продажу.",
          "1) Liquidity pull: the creator removes the money from the pool and there is no one left to sell to. 2) Dump: the creator or linked wallets sell a large bag into a thin pool. 3) Abuse of contract powers: minting more, freezing wallets, a 100% sell tax.",
          "1) Liquiditätsabzug: Der Creator holt das Geld aus dem Pool, und es gibt niemanden mehr, an den man verkaufen kann. 2) Abverkauf: Der Creator oder verbundene Wallets verkaufen einen großen Bestand in einen dünnen Pool. 3) Missbrauch von Contract-Rechten: Nachprägen, Einfrieren, 100 % Verkaufssteuer.",
          "1) Retiro de liquidez: el creador saca el dinero del pool y no queda a quién vender. 2) Venta masiva: el creador o wallets vinculadas venden un gran paquete en un pool escaso. 3) Abuso de poderes del contrato: emitir más, congelar wallets, impuesto de venta del 100 %.",
          "1）撤池：创建者从池子里抽走资金，再也没人接盘。2）砸盘：创建者或关联钱包把大量代币卖进薄弱的池子。3）滥用合约权限：增发、冻结钱包、100% 卖出税。",
        ),
      },
      {
        h: L(
          "Что видно заранее",
          "What you can see in advance",
          "Was man vorher sieht",
          "Qué se ve de antemano",
          "可以提前看到什么",
        ),
        p: L(
          "Живые права контракта, крупная доля у создателя, концентрация у нескольких кошельков, возможно связанные кошельки, ликвидность в пару процентов от капитализации и продажи создателя в первые часы. Ни один признак не доказывает мошенничество, но вместе они сильно повышают риск.",
          "Active contract powers, a large creator share, concentration in a few wallets, possibly related wallets, liquidity of a few percent of market cap and creator sells in the first hours. No single sign proves fraud, but together they raise the risk a lot.",
          "Aktive Contract-Rechte, ein großer Creator-Anteil, Konzentration auf wenige Wallets, möglicherweise verbundene Wallets, Liquidität von wenigen Prozent der Marktkapitalisierung und Creator-Verkäufe in den ersten Stunden. Kein einzelnes Zeichen beweist Betrug, aber zusammen erhöhen sie das Risiko stark.",
          "Poderes del contrato activos, una gran cuota del creador, concentración en pocas wallets, wallets posiblemente vinculadas, liquidez de pocos puntos porcentuales de la capitalización y ventas del creador en las primeras horas. Ninguna señal prueba un fraude, pero juntas elevan mucho el riesgo.",
          "合约权限仍有效、创建者持仓大、集中在少数钱包、可能关联的钱包、流动性仅占市值的几个百分点、创建者在头几个小时就卖出。单个迹象不能证明欺诈，但叠加起来风险会大幅上升。",
        ),
      },
    ],
    check: L(
      "Отчёт QUVR Pulse проверяет все эти признаки сразу и сводит их в «Итог проверки». Мы никогда не пишем «безопасно»: лучший возможный результат — «низкий обнаруженный риск».",
      "A QUVR Pulse report checks all these signs at once and sums them up in the “Bottom line”. We never say “safe”: the best possible result is “low detected risk”.",
      "Ein QUVR-Pulse-Bericht prüft all diese Zeichen auf einmal und fasst sie im „Fazit“ zusammen. Wir sagen nie „sicher“: Das bestmögliche Ergebnis ist „geringes erkanntes Risiko“.",
      "Un informe de QUVR Pulse revisa todas estas señales a la vez y las resume en la «Conclusión». Nunca decimos «seguro»: el mejor resultado posible es «riesgo detectado bajo».",
      "QUVR Pulse 报告会一次性检查所有这些迹象，并在“检查结论”中汇总。我们从不说“安全”：最好的结果是“检出风险较低”。",
    ),
    faq: [
      {
        q: L(
          "Можно ли вернуть деньги после rug pull?",
          "Can you get money back after a rug pull?",
          "Kann man nach einem Rug Pull Geld zurückbekommen?",
          "¿Se puede recuperar el dinero tras un rug pull?",
          "被跑路后能拿回钱吗？",
        ),
        a: L(
          "Почти никогда: транзакции в блокчейне необратимы. Поэтому проверять токен нужно до покупки, а не после.",
          "Almost never: blockchain transactions are irreversible. That is why the check has to happen before you buy, not after.",
          "Fast nie: Blockchain-Transaktionen sind unumkehrbar. Deshalb muss die Prüfung vor dem Kauf stattfinden, nicht danach.",
          "Casi nunca: las transacciones en blockchain son irreversibles. Por eso hay que revisar antes de comprar, no después.",
          "几乎不可能：区块链交易不可逆。所以要在买入前检查，而不是之后。",
        ),
      },
    ],
  },
  {
    slug: "bonding-curve",
    codes: ["liquidity.new-pool"],
    title: L(
      "Бондинг-кривая pump.fun: как работает и почему она не держатель",
      "pump.fun bonding curve: how it works and why it is not a holder",
      "pump.fun Bonding Curve: So funktioniert sie und warum sie kein Holder ist",
      "Bonding curve de pump.fun: cómo funciona y por qué no es un holder",
      "pump.fun 联合曲线：如何运作，为什么它不算持有人",
    ),
    description: L(
      "Бондинг-кривая — смарт-контракт pump.fun, который продаёт токен по формуле до «выпуска» в пул. Почему её доля не считается концентрацией и что происходит при выходе на PumpSwap.",
      "A bonding curve is the pump.fun smart contract that sells a token by formula until it graduates to a pool. Why its share is not holder concentration and what happens on graduation to PumpSwap.",
      "Die Bonding Curve ist der pump.fun-Smart-Contract, der einen Token per Formel verkauft, bis er in einen Pool wechselt. Warum ihr Anteil keine Konzentration ist und was beim Wechsel zu PumpSwap passiert.",
      "La bonding curve es el contrato de pump.fun que vende un token según una fórmula hasta que se gradúa a un pool. Por qué su cuota no es concentración y qué pasa al graduarse a PumpSwap.",
      "联合曲线是 pump.fun 的智能合约，在代币“毕业”进入交易池之前按公式出售代币。为什么它的份额不算持仓集中，以及毕业到 PumpSwap 时会发生什么。",
    ),
    h1: L(
      "Бондинг-кривая (bonding curve)",
      "Bonding curve",
      "Bonding Curve",
      "Bonding curve (curva de vinculación)",
      "联合曲线（Bonding curve）",
    ),
    short: L(
      "Контракт, который продаёт и покупает токен по заранее заданной формуле: чем больше купили, тем выше цена.",
      "A contract that buys and sells a token along a fixed formula: the more has been bought, the higher the price.",
      "Ein Contract, der einen Token nach einer festen Formel kauft und verkauft: Je mehr gekauft wurde, desto höher der Preis.",
      "Un contrato que compra y vende un token según una fórmula fija: cuanto más se ha comprado, más alto el precio.",
      "按固定公式买卖代币的合约：买得越多，价格越高。",
    ),
    sections: [
      {
        h: H_HOW,
        p: L(
          "Новый токен pump.fun сначала торгуется только через свою кривую. Когда капитализация доходит до порога, токен «выпускается»: ликвидность переносится в пул PumpSwap, и дальше торговля идёт как на обычной бирже.",
          "A new pump.fun token first trades only through its curve. When market cap reaches the threshold, the token graduates: liquidity moves into a PumpSwap pool and trading continues like on a normal DEX.",
          "Ein neuer pump.fun-Token wird zuerst nur über seine Kurve gehandelt. Erreicht die Marktkapitalisierung die Schwelle, graduiert der Token: Die Liquidität wandert in einen PumpSwap-Pool, und der Handel läuft wie an einer normalen DEX weiter.",
          "Un token nuevo de pump.fun primero se negocia solo a través de su curva. Cuando la capitalización llega al umbral, el token se gradúa: la liquidez pasa a un pool de PumpSwap y el trading sigue como en un DEX normal.",
          "新的 pump.fun 代币起初只能通过它的曲线交易。市值达到门槛后，代币“毕业”：流动性转入 PumpSwap 池，此后像普通 DEX 一样交易。",
        ),
      },
      {
        h: H_WHY,
        p: L(
          "Кривая держит большую часть ещё не проданных токенов, поэтому её часто принимают за «кита». Это ошибка: её токены принадлежат механизму продажи, а не человеку. Если не исключить кривую, концентрация будет выглядеть страшнее, чем есть.",
          "The curve holds most of the tokens not yet sold, so it is often mistaken for a whale. That is wrong: its tokens belong to the sale mechanism, not a person. Without excluding the curve, concentration looks worse than it is.",
          "Die Kurve hält die meisten noch nicht verkauften Tokens und wird daher oft für einen Wal gehalten. Das ist falsch: Ihre Tokens gehören dem Verkaufsmechanismus, nicht einer Person. Ohne Ausschluss der Kurve wirkt die Konzentration schlimmer, als sie ist.",
          "La curva guarda la mayoría de los tokens aún no vendidos, por eso a menudo se confunde con una ballena. Es un error: sus tokens pertenecen al mecanismo de venta, no a una persona. Si no se excluye, la concentración parece peor de lo que es.",
          "曲线持有大部分尚未售出的代币，所以常被误认为“巨鲸”。这是错误的：这些代币属于销售机制，而不是某个人。如果不剔除曲线，持仓集中度会看起来比实际更糟。",
        ),
      },
    ],
    check: L(
      "QUVR Pulse находит кривую pump.fun по её адресу (PDA) и исключает её и пулы из расчёта концентрации. Там же отчёт читает создателя токена — он записан в аккаунте кривой.",
      "QUVR Pulse finds the pump.fun curve by its address (PDA) and excludes it and the pools from concentration. The report also reads the token creator — it is stored in the curve account.",
      "QUVR Pulse findet die pump.fun-Kurve über ihre Adresse (PDA) und nimmt sie sowie die Pools aus der Konzentration heraus. Dort liest der Bericht auch den Creator — er steht im Kurven-Account.",
      "QUVR Pulse encuentra la curva de pump.fun por su dirección (PDA) y la excluye, junto con los pools, del cálculo de concentración. Allí también lee el creador del token: está guardado en la cuenta de la curva.",
      "QUVR Pulse 通过地址（PDA）找到 pump.fun 曲线，并把它和交易池排除在集中度计算之外。报告还会从曲线账户中读取代币创建者。",
    ),
    faq: [
      {
        q: L(
          "Почему у токена на кривой нет ликвидности в отчёте?",
          "Why does a token on the curve show no liquidity?",
          "Warum zeigt ein Token auf der Kurve keine Liquidität?",
          "¿Por qué un token en la curva no muestra liquidez?",
          "为什么曲线阶段的代币没有流动性数据？",
        ),
        a: L(
          "До выпуска у токена нет обычного пула: цену задаёт формула кривой. Поэтому ликвидность и проскальзывание для него отмечены «Нет данных».",
          "Before graduation there is no regular pool: the price comes from the curve formula. So liquidity and price impact are shown as “No data”.",
          "Vor der Graduierung gibt es keinen normalen Pool: Der Preis ergibt sich aus der Kurvenformel. Daher stehen Liquidität und Preiseinfluss auf „Keine Daten“.",
          "Antes de graduarse no hay un pool normal: el precio sale de la fórmula de la curva. Por eso la liquidez y el impacto en el precio aparecen como «Sin datos».",
          "毕业前没有常规交易池：价格由曲线公式决定。因此流动性和价格影响显示为“暂无数据”。",
        ),
      },
    ],
  },
  {
    slug: "price-impact",
    codes: ["liquidity.impact"],
    title: L(
      "Price impact (проскальзывание): насколько ваша продажа уронит цену",
      "Price impact: how far your sell will move the price",
      "Price Impact: Wie stark dein Verkauf den Kurs bewegt",
      "Price impact: cuánto moverá el precio tu venta",
      "价格影响（滑点）：你的卖单会让价格跌多少",
    ),
    description: L(
      "Price impact показывает, на сколько процентов изменится цена от вашей сделки. При тонкой ликвидности продажа на $1 000 может обрушить цену на десятки процентов.",
      "Price impact shows how many percent your trade moves the price. With thin liquidity a $1,000 sell can crash the price by tens of percent.",
      "Der Price Impact zeigt, um wie viel Prozent dein Trade den Kurs bewegt. Bei dünner Liquidität kann ein Verkauf über 1.000 $ den Kurs um zig Prozent drücken.",
      "El price impact muestra cuánto por ciento mueve el precio tu operación. Con liquidez escasa, una venta de 1.000 $ puede hundir el precio decenas de puntos.",
      "价格影响表示你的交易会让价格变动百分之几。流动性薄弱时，1000 美元的卖单就可能让价格下跌几十个百分点。",
    ),
    h1: L(
      "Price impact (влияние сделки на цену)",
      "Price impact",
      "Price Impact (Preiseinfluss)",
      "Price impact (impacto en el precio)",
      "价格影响（Price impact）",
    ),
    short: L(
      "Сколько процентов цены «съест» ваша сделка из-за того, что в пуле мало денег.",
      "How much of the price your trade eats because the pool holds little money.",
      "Wie viel vom Preis dein Trade „frisst“, weil im Pool wenig Geld liegt.",
      "Cuánto del precio «se come» tu operación porque el pool tiene poco dinero.",
      "由于池中资金少，你的交易会“吃掉”多少价格。",
    ),
    sections: [
      {
        h: H_WHY,
        p: L(
          "На экране может быть капитализация в миллионы, но если в пуле всего $30 000, крупный держатель не сможет выйти без обвала цены — и вы тоже. Проскальзывание показывает реальную ширину «двери на выход».",
          "The screen may show a market cap in the millions, but if the pool holds only $30,000, a large holder cannot exit without crashing the price — and neither can you. Price impact shows how wide the exit door really is.",
          "Der Bildschirm zeigt vielleicht eine Marktkapitalisierung in Millionen, aber liegen nur 30.000 $ im Pool, kann ein großer Holder nicht aussteigen, ohne den Kurs einbrechen zu lassen — und du auch nicht. Der Price Impact zeigt, wie breit die Ausgangstür wirklich ist.",
          "La pantalla puede mostrar una capitalización de millones, pero si el pool tiene solo 30.000 $, un gran holder no puede salir sin hundir el precio, y tú tampoco. El price impact muestra lo ancha que es la puerta de salida.",
          "屏幕上的市值也许有几百万，但如果池里只有 3 万美元，大户无法在不砸盘的情况下退出——你也一样。价格影响显示了“出口”到底有多宽。",
        ),
      },
      {
        h: H_HOW,
        p: L(
          "Ориентир: до 1–2% на сумму вашей сделки — нормально, 5–10% — тонко, больше 20% — продать заметную сумму без потерь почти невозможно.",
          "Rule of thumb: up to 1–2% for your trade size is normal, 5–10% is thin, over 20% means selling a meaningful amount without big losses is nearly impossible.",
          "Faustregel: bis 1–2 % für deine Tradegröße ist normal, 5–10 % ist dünn, über 20 % heißt: Einen nennenswerten Betrag ohne große Verluste zu verkaufen, ist kaum möglich.",
          "Regla práctica: hasta 1–2 % para tu tamaño de operación es normal, 5–10 % es escaso, más del 20 % significa que vender una cantidad relevante sin grandes pérdidas es casi imposible.",
          "经验法则：你的交易规模对应 1–2% 以内算正常，5–10% 偏薄，超过 20% 意味着想卖出一笔可观的金额而不大亏几乎不可能。",
        ),
      },
    ],
    check: L(
      "QUVR Pulse считает влияние продажи на $100, $1 000, $5 000 и $10 000 по реальной ликвидности пула (для Uniswap v4 — по активной ликвидности текущего тика).",
      "QUVR Pulse calculates the impact of selling $100, $1,000, $5,000 and $10,000 from the pool's real liquidity (for Uniswap v4 — from the active liquidity at the current tick).",
      "QUVR Pulse berechnet den Einfluss von Verkäufen über 100 $, 1.000 $, 5.000 $ und 10.000 $ aus der echten Pool-Liquidität (bei Uniswap v4 aus der aktiven Liquidität am aktuellen Tick).",
      "QUVR Pulse calcula el impacto de vender 100 $, 1.000 $, 5.000 $ y 10.000 $ con la liquidez real del pool (en Uniswap v4, con la liquidez activa del tick actual).",
      "QUVR Pulse 根据交易池的真实流动性计算卖出 100、1000、5000 和 10000 美元的影响（Uniswap v4 按当前 tick 的活跃流动性计算）。",
    ),
    faq: [
      {
        q: L(
          "Чем price impact отличается от slippage?",
          "How is price impact different from slippage?",
          "Was ist der Unterschied zwischen Price Impact und Slippage?",
          "¿En qué se diferencia el price impact del slippage?",
          "价格影响和滑点设置有什么区别？",
        ),
        a: L(
          "Price impact — сдвиг цены из-за вашей сделки. Slippage в кошельке — допустимое отклонение, после которого сделка отменится. Высокий slippage, выставленный «чтобы прошло», не уменьшает потери.",
          "Price impact is the price move caused by your trade. Slippage in your wallet is the tolerance after which the trade is cancelled. Setting high slippage “so it goes through” does not reduce the loss.",
          "Price Impact ist die Kursbewegung durch deinen Trade. Slippage in der Wallet ist die Toleranz, ab der der Trade abgebrochen wird. Hohe Slippage „damit es durchgeht“ verringert den Verlust nicht.",
          "El price impact es el movimiento de precio causado por tu operación. El slippage en la wallet es la tolerancia tras la que se cancela la operación. Poner slippage alto «para que pase» no reduce la pérdida.",
          "价格影响是你的交易造成的价格变动；钱包里的滑点是超出后交易会被取消的容忍度。为了“能成交”而调高滑点并不会减少损失。",
        ),
      },
    ],
  },
  {
    slug: "liquidity-to-market-cap",
    codes: ["liquidity.low", "liquidity.declining"],
    title: L(
      "Ликвидность и капитализация: почему «$10 млн» могут быть бумажными",
      "Liquidity vs market cap: why “$10M” can be paper money",
      "Liquidität vs. Marktkapitalisierung: Warum „10 Mio. $“ nur auf dem Papier stehen können",
      "Liquidez vs. capitalización: por qué «10 M$» pueden ser de papel",
      "流动性与市值：为什么“1000 万美元”可能只是纸面数字",
    ),
    description: L(
      "Отношение ликвидности к капитализации показывает, какая часть «стоимости» токена реально может быть продана. Меньше 3% — тревожный признак.",
      "The liquidity-to-market-cap ratio shows how much of a token's “value” could actually be sold. Under 3% is a warning sign.",
      "Das Verhältnis von Liquidität zu Marktkapitalisierung zeigt, wie viel vom „Wert“ eines Tokens tatsächlich verkauft werden könnte. Unter 3 % ist ein Warnsignal.",
      "La relación entre liquidez y capitalización muestra qué parte del «valor» de un token podría venderse de verdad. Menos del 3 % es una señal de alerta.",
      "流动性与市值之比表示代币“价值”中真正能卖出去的部分。低于 3% 是警示信号。",
    ),
    h1: L(
      "Ликвидность к капитализации",
      "Liquidity to market cap",
      "Liquidität zu Marktkapitalisierung",
      "Liquidez respecto a la capitalización",
      "流动性与市值之比",
    ),
    short: L(
      "Сколько процентов от капитализации лежит в пулах. Это деньги, которые реально можно получить при продаже.",
      "What percentage of market cap sits in the pools. That is the money you could actually get when selling.",
      "Wie viel Prozent der Marktkapitalisierung in den Pools liegen. Das ist das Geld, das man beim Verkauf tatsächlich bekommen kann.",
      "Qué porcentaje de la capitalización está en los pools. Es el dinero que realmente se puede obtener al vender.",
      "市值中有百分之几放在交易池里。这才是卖出时真正能拿到的钱。",
    ),
    sections: [
      {
        h: H_WHY,
        p: L(
          "Капитализация — это цена последней сделки, умноженная на все токены. Она ничего не говорит о том, сколько денег можно вывести. При ликвидности 1% от капитализации первая же крупная продажа сдвинет цену на десятки процентов.",
          "Market cap is the last trade price times all tokens. It says nothing about how much money can be taken out. With liquidity at 1% of market cap, the first large sell moves the price by tens of percent.",
          "Die Marktkapitalisierung ist der letzte Handelspreis mal alle Tokens. Sie sagt nichts darüber, wie viel Geld sich abziehen lässt. Bei Liquidität von 1 % der Marktkapitalisierung bewegt schon der erste große Verkauf den Kurs um zig Prozent.",
          "La capitalización es el precio de la última operación por todos los tokens. No dice nada de cuánto dinero se puede retirar. Con una liquidez del 1 % de la capitalización, la primera venta grande mueve el precio decenas de puntos.",
          "市值是最后成交价乘以全部代币数量，它并不能说明能取出多少钱。如果流动性只有市值的 1%，第一笔大额卖单就会让价格变动几十个百分点。",
        ),
      },
      {
        h: H_HOW,
        p: L(
          "Ориентиры для мемкоинов: 10% и выше — глубокий рынок, 3–10% — средний, ниже 3% — капитализация во многом бумажная. Важна и динамика: если ликвидность быстро уходит из пула, это тревожнее, чем низкий, но стабильный уровень.",
          "Memecoin rules of thumb: 10% or more is a deep market, 3–10% is average, under 3% means the market cap is largely on paper. The trend matters too: liquidity leaving the pool fast is more worrying than a low but stable level.",
          "Faustregeln für Memecoins: 10 % oder mehr ist ein tiefer Markt, 3–10 % durchschnittlich, unter 3 % heißt: Die Marktkapitalisierung steht größtenteils auf dem Papier. Auch der Trend zählt: Schnell abfließende Liquidität ist beunruhigender als ein niedriges, aber stabiles Niveau.",
          "Reglas prácticas para memecoins: 10 % o más es un mercado profundo, 3–10 % es medio, por debajo del 3 % la capitalización es en gran parte de papel. También importa la tendencia: la liquidez que sale rápido del pool preocupa más que un nivel bajo pero estable.",
          "Memecoin 的经验值：10% 以上属于深度较好的市场，3–10% 一般，低于 3% 意味着市值大多是纸面数字。趋势也很重要：流动性快速流出比低而稳定的水平更令人担忧。",
        ),
      },
    ],
    check: L(
      "QUVR Pulse показывает отношение ликвидности к капитализации, долю основного пула, возраст пула и изменение ликвидности по нашим снимкам каждые 15 секунд.",
      "QUVR Pulse shows the liquidity-to-market-cap ratio, the main pool's share, the pool age and how liquidity changes, from our snapshots every 15 seconds.",
      "QUVR Pulse zeigt das Verhältnis von Liquidität zu Marktkapitalisierung, den Anteil des Haupt-Pools, das Pool-Alter und die Veränderung der Liquidität aus unseren Snapshots alle 15 Sekunden.",
      "QUVR Pulse muestra la relación entre liquidez y capitalización, la cuota del pool principal, la antigüedad del pool y la variación de la liquidez según nuestras capturas cada 15 segundos.",
      "QUVR Pulse 展示流动性与市值之比、主交易池占比、池龄，以及根据每 15 秒快照得出的流动性变化。",
    ),
    faq: [
      {
        q: L(
          "Заблокированная ликвидность решает проблему?",
          "Does locked liquidity solve the problem?",
          "Löst gesperrte Liquidität das Problem?",
          "¿La liquidez bloqueada resuelve el problema?",
          "锁定流动性能解决问题吗？",
        ),
        a: L(
          "Она мешает создателю вывести пул, но не делает пул глубже. Тонкая заблокированная ликвидность всё равно даёт большое проскальзывание.",
          "It stops the creator from pulling the pool but does not make the pool deeper. Thin locked liquidity still means high price impact.",
          "Sie hindert den Creator daran, den Pool abzuziehen, macht ihn aber nicht tiefer. Dünne gesperrte Liquidität bedeutet trotzdem hohen Preiseinfluss.",
          "Impide que el creador retire el pool, pero no lo hace más profundo. Una liquidez escasa aunque bloqueada sigue implicando un gran impacto en el precio.",
          "它能阻止创建者撤池，但不会让池子更深。流动性薄即使被锁定，价格影响依然很大。",
        ),
      },
    ],
  },
  {
    slug: "holder-concentration",
    codes: [
      "distribution.concentrated",
      "distribution.deployer-share",
      "distribution.deployer-selling",
      "distribution.mass-transfers",
    ],
    title: L(
      "Концентрация держателей: сколько токенов у топ-10 и почему это важно",
      "Holder concentration: how much the top 10 own and why it matters",
      "Holder-Konzentration: Wie viel die Top 10 halten und warum das zählt",
      "Concentración de holders: cuánto tienen los 10 principales y por qué importa",
      "持仓集中度：前 10 名持有多少，为什么重要",
    ),
    description: L(
      "Если несколько кошельков держат большую часть токенов, одна их продажа обвалит цену. Как правильно считать концентрацию — без пулов и бондинг-кривых.",
      "If a few wallets hold most of the supply, a single sell from them crashes the price. How to measure concentration correctly — without pools and bonding curves.",
      "Halten wenige Wallets den Großteil des Angebots, bringt ein einziger Verkauf den Kurs zum Einsturz. So misst man die Konzentration richtig — ohne Pools und Bonding Curves.",
      "Si pocas wallets tienen la mayor parte del suministro, una sola venta suya hunde el precio. Cómo medir bien la concentración, sin pools ni bonding curves.",
      "如果少数钱包持有大部分代币，他们一次卖出就会让价格崩盘。如何正确计算集中度——剔除交易池和联合曲线。",
    ),
    h1: L(
      "Концентрация держателей",
      "Holder concentration",
      "Holder-Konzentration",
      "Concentración de holders",
      "持仓集中度",
    ),
    short: L(
      "Какая доля токенов лежит у крупнейших кошельков. Чем она выше, тем сильнее цена зависит от решения нескольких людей.",
      "What share of the supply sits in the largest wallets. The higher it is, the more the price depends on a few people's decisions.",
      "Welcher Anteil des Angebots bei den größten Wallets liegt. Je höher, desto stärker hängt der Kurs von den Entscheidungen weniger Personen ab.",
      "Qué parte del suministro está en las wallets más grandes. Cuanto mayor, más depende el precio de las decisiones de unas pocas personas.",
      "最大钱包持有的代币比例。比例越高，价格越取决于少数人的决定。",
    ),
    sections: [
      {
        h: L(
          "Как считать правильно",
          "How to measure it correctly",
          "Wie man richtig misst",
          "Cómo medirla bien",
          "正确的计算方法",
        ),
        p: L(
          "Крупнейшие «держатели» — часто пулы ликвидности, бондинг-кривые, адреса сжигания и контракты бирж. Их нужно исключить, иначе цифра будет пугающей и бессмысленной. Отдельно стоит смотреть долю создателя и продаёт ли он.",
          "The largest “holders” are often liquidity pools, bonding curves, burn addresses and exchange contracts. They must be excluded, otherwise the number is scary and meaningless. Look separately at the creator's share and whether they are selling.",
          "Die größten „Holder“ sind oft Liquiditätspools, Bonding Curves, Burn-Adressen und Börsen-Contracts. Sie müssen herausgerechnet werden, sonst ist die Zahl beängstigend und bedeutungslos. Schau dir separat den Anteil des Creators an und ob er verkauft.",
          "Los mayores «holders» suelen ser pools de liquidez, bonding curves, direcciones de quema y contratos de exchanges. Hay que excluirlos, si no la cifra asusta y no significa nada. Mira aparte la cuota del creador y si está vendiendo.",
          "最大的“持有人”往往是流动性池、联合曲线、销毁地址和交易所合约。必须把它们剔除，否则数字既吓人又没有意义。还要单独看创建者的份额以及他是否在卖出。",
        ),
      },
      {
        h: H_HOW,
        p: L(
          "Ориентиры: если топ-10 без пулов держат больше 50%, цена очень чувствительна к их продажам. Доля создателя больше 5–10% и его продажи в первые часы — одни из самых надёжных тревожных сигналов.",
          "Rules of thumb: if the top 10 excluding pools hold over 50%, the price is very sensitive to their sells. A creator share above 5–10% and creator sells in the first hours are among the most reliable warning signs.",
          "Faustregeln: Halten die Top 10 ohne Pools über 50 %, reagiert der Kurs sehr empfindlich auf ihre Verkäufe. Ein Creator-Anteil über 5–10 % und Creator-Verkäufe in den ersten Stunden gehören zu den verlässlichsten Warnsignalen.",
          "Reglas prácticas: si el top 10 sin pools tiene más del 50 %, el precio es muy sensible a sus ventas. Una cuota del creador superior al 5–10 % y sus ventas en las primeras horas están entre las señales de alerta más fiables.",
          "经验法则：剔除池子后前 10 名持有超过 50%，价格对他们的卖出会非常敏感。创建者持仓超过 5–10% 以及他在头几个小时内卖出，是最可靠的预警信号之一。",
        ),
      },
    ],
    check: L(
      "QUVR Pulse показывает долю топ-1/5/10/20 без пулов, кривых и сожжённых адресов, долю создателя, его покупки и продажи и массовые рассылки токенов.",
      "QUVR Pulse shows the top 1/5/10/20 share without pools, curves and burn addresses, the creator's share, their buys and sells, and mass token distributions.",
      "QUVR Pulse zeigt den Anteil der Top 1/5/10/20 ohne Pools, Kurven und Burn-Adressen, den Creator-Anteil, seine Käufe und Verkäufe sowie Massenverteilungen von Tokens.",
      "QUVR Pulse muestra la cuota del top 1/5/10/20 sin pools, curvas ni direcciones de quema, la cuota del creador, sus compras y ventas y las distribuciones masivas de tokens.",
      "QUVR Pulse 展示剔除池子、曲线和销毁地址后前 1/5/10/20 名的占比、创建者份额、其买卖记录以及代币批量分发情况。",
    ),
    faq: [
      {
        q: L(
          "Высокая концентрация всегда плохо?",
          "Is high concentration always bad?",
          "Ist hohe Konzentration immer schlecht?",
          "¿Una concentración alta siempre es mala?",
          "集中度高一定不好吗？",
        ),
        a: L(
          "Не всегда: у очень молодого токена почти всегда мало держателей. Но это значит, что судьба цены в руках нескольких кошельков, и это надо учитывать.",
          "Not always: a very young token almost always has few holders. But it means the price is in the hands of a few wallets, and that has to be taken into account.",
          "Nicht immer: Ein sehr junger Token hat fast immer wenige Holder. Aber es bedeutet, dass der Kurs in den Händen weniger Wallets liegt, und das muss man einrechnen.",
          "No siempre: un token muy nuevo casi siempre tiene pocos holders. Pero significa que el precio está en manos de pocas wallets, y hay que tenerlo en cuenta.",
          "不一定：非常新的代币持有人几乎总是很少。但这意味着价格掌握在少数钱包手里，必须考虑到这一点。",
        ),
      },
    ],
  },
  {
    slug: "possibly-related-wallets",
    codes: ["distribution.cluster."],
    title: L(
      "Возможно связанные кошельки: как найти скрытую долю создателя",
      "Possibly related wallets: how to spot a creator's hidden share",
      "Möglicherweise verbundene Wallets: So erkennst du den versteckten Anteil des Creators",
      "Wallets posiblemente vinculadas: cómo detectar la cuota oculta del creador",
      "可能关联的钱包：如何发现创建者的隐藏份额",
    ),
    description: L(
      "Создатель может разложить токены по десяткам кошельков, чтобы концентрация выглядела нормальной. По каким признакам кошельки могут быть связаны и почему это не доказательство.",
      "A creator can spread tokens across dozens of wallets so concentration looks normal. Which signs suggest wallets may be linked, and why that is not proof.",
      "Ein Creator kann Tokens auf Dutzende Wallets verteilen, damit die Konzentration normal wirkt. Welche Merkmale auf eine Verbindung hindeuten und warum das kein Beweis ist.",
      "Un creador puede repartir los tokens entre decenas de wallets para que la concentración parezca normal. Qué señales sugieren que están vinculadas y por qué no es una prueba.",
      "创建者可以把代币分散到几十个钱包里，让集中度看起来正常。哪些迹象说明钱包可能有关联，以及为什么这并不是证据。",
    ),
    h1: L(
      "Возможно связанные кошельки",
      "Possibly related wallets",
      "Möglicherweise verbundene Wallets",
      "Wallets posiblemente vinculadas",
      "可能关联的钱包",
    ),
    short: L(
      "Кошельки с общими признаками происхождения. Могут принадлежать одному человеку, а могут и нет — это эвристика, а не доказательство.",
      "Wallets that share signs of common origin. They may belong to one person or not — it is a heuristic, not proof.",
      "Wallets mit gemeinsamen Herkunftsmerkmalen. Sie können einer Person gehören oder auch nicht — das ist eine Heuristik, kein Beweis.",
      "Wallets con señales de origen común. Pueden pertenecer a una persona o no: es una heurística, no una prueba.",
      "具有共同来源特征的钱包。它们可能属于同一个人，也可能不是——这是启发式判断，不是证据。",
    ),
    sections: [
      {
        h: L(
          "Какие признаки мы смотрим",
          "Which signs we look at",
          "Welche Merkmale wir prüfen",
          "Qué señales miramos",
          "我们检查哪些迹象",
        ),
        p: L(
          "Кошелёк получил токены напрямую от создателя (не через своп); первые средства на кошелёк пришли от создателя или от того же адреса, что и у других держателей; первые покупки сделаны в одном и том же блоке или слоте.",
          "The wallet received tokens straight from the creator (not via a swap); the wallet's first funds came from the creator or from the same address as other holders; first buys happened in the same block or slot.",
          "Die Wallet hat Tokens direkt vom Creator erhalten (nicht per Swap); das erste Guthaben kam vom Creator oder von derselben Adresse wie bei anderen Holdern; die ersten Käufe fanden im selben Block oder Slot statt.",
          "La wallet recibió tokens directamente del creador (no por swap); sus primeros fondos llegaron del creador o de la misma dirección que otros holders; las primeras compras ocurrieron en el mismo bloque o slot.",
          "该钱包直接从创建者处收到代币（而非通过兑换）；钱包的第一笔资金来自创建者，或与其他持有人来自同一地址；首次买入发生在同一区块或同一 slot。",
        ),
      },
      {
        h: L(
          "Почему это не доказательство",
          "Why it is not proof",
          "Warum das kein Beweis ist",
          "Por qué no es una prueba",
          "为什么这不是证据",
        ),
        p: L(
          "Биржи и торговые боты пополняют тысячи несвязанных кошельков, а в популярный момент много людей покупают в одном блоке. Поэтому мы отсеиваем адреса бирж и ботов и всегда пишем «возможно связанные», а не «принадлежат одному владельцу».",
          "Exchanges and trading bots fund thousands of unrelated wallets, and at a hot moment many people buy in the same block. That is why we filter out exchange and bot addresses and always say “possibly related”, never “owned by one person”.",
          "Börsen und Trading-Bots finanzieren Tausende nicht verbundener Wallets, und in einem heißen Moment kaufen viele Leute im selben Block. Deshalb filtern wir Börsen- und Bot-Adressen heraus und sagen immer „möglicherweise verbunden“, nie „gehören einer Person“.",
          "Los exchanges y los bots de trading financian miles de wallets sin relación, y en un momento caliente mucha gente compra en el mismo bloque. Por eso filtramos direcciones de exchanges y bots y siempre decimos «posiblemente vinculadas», nunca «de un mismo dueño».",
          "交易所和交易机器人会为成千上万个互不相关的钱包注资，热门时刻也会有很多人在同一区块买入。因此我们会过滤交易所和机器人地址，并且始终说“可能关联”，而不是“属于同一人”。",
        ),
      },
    ],
    check: L(
      "QUVR Pulse проверяет крупнейших держателей, группирует их в кластеры с уровнем уверенности и показывает общую долю каждой группы и её связь с создателем.",
      "QUVR Pulse checks the largest holders, groups them into clusters with a confidence level and shows each group's combined share and its link to the creator.",
      "QUVR Pulse prüft die größten Holder, fasst sie in Cluster mit Verlässlichkeitsstufe zusammen und zeigt den Gesamtanteil jeder Gruppe und ihre Verbindung zum Creator.",
      "QUVR Pulse revisa los mayores holders, los agrupa en clústeres con un nivel de confianza y muestra la cuota combinada de cada grupo y su vínculo con el creador.",
      "QUVR Pulse 检查最大的持有人，将其按可信度分组为集群，并显示每组的合计占比及其与创建者的关联。",
    ),
    faq: [
      {
        q: L(
          "Что делать, если нашлись связанные кошельки?",
          "What if possibly related wallets are found?",
          "Was, wenn möglicherweise verbundene Wallets gefunden werden?",
          "¿Qué hacer si aparecen wallets posiblemente vinculadas?",
          "发现可能关联的钱包怎么办？",
        ),
        a: L(
          "Сложите их долю с долей создателя: так видно, сколько токенов реально может оказаться в одних руках. Чем больше суммарная доля, тем выше риск резкой продажи.",
          "Add their share to the creator's: that shows how much of the supply could really be in one pair of hands. The larger the combined share, the higher the risk of a sudden dump.",
          "Addiere ihren Anteil zum Anteil des Creators: So siehst du, wie viel des Angebots tatsächlich in einer Hand liegen könnte. Je größer der Gesamtanteil, desto höher das Risiko eines plötzlichen Abverkaufs.",
          "Suma su cuota a la del creador: así ves cuánto del suministro podría estar realmente en las mismas manos. Cuanto mayor la cuota combinada, mayor el riesgo de una venta brusca.",
          "把它们的份额与创建者的份额相加：就能看出有多少代币可能实际握在同一个人手里。合计份额越大，突然砸盘的风险越高。",
        ),
      },
    ],
  },
  {
    slug: "upgradeable-proxy",
    codes: ["contract.proxy", "contract.upgrade", "contract.delegatecall", "contract.owner.eoa"],
    title: L(
      "Обновляемый прокси-контракт: зачем он и чем опасен в токене",
      "Upgradeable proxy contract: what it is and why it matters in a token",
      "Upgradebarer Proxy-Contract: Was das ist und warum er bei Tokens zählt",
      "Contrato proxy actualizable: qué es y por qué importa en un token",
      "可升级代理合约：是什么，为什么在代币中值得注意",
    ),
    description: L(
      "Прокси-контракт позволяет заменить логику токена после запуска. Владелец может добавить комиссию, блокировку или выпуск. Как понять, кто управляет обновлением.",
      "A proxy contract lets the token's logic be replaced after launch. The owner could add a tax, a block or minting. How to see who controls upgrades.",
      "Ein Proxy-Contract erlaubt es, die Logik des Tokens nach dem Start auszutauschen. Der Owner könnte eine Steuer, eine Sperre oder Minting hinzufügen. So siehst du, wer die Upgrades kontrolliert.",
      "Un contrato proxy permite reemplazar la lógica del token tras el lanzamiento. El propietario podría añadir un impuesto, un bloqueo o emisión. Cómo ver quién controla las actualizaciones.",
      "代理合约允许在上线后替换代币逻辑。所有者可以加入税费、限制或增发。如何查看谁控制升级。",
    ),
    h1: L(
      "Обновляемый прокси-контракт",
      "Upgradeable proxy contract",
      "Upgradebarer Proxy-Contract",
      "Contrato proxy actualizable",
      "可升级代理合约",
    ),
    short: L(
      "Контракт, у которого можно подменить код. Сегодня он честный, а после обновления может вести себя иначе.",
      "A contract whose code can be swapped. It may be fair today and behave differently after an upgrade.",
      "Ein Contract, dessen Code ausgetauscht werden kann. Heute ist er fair, nach einem Upgrade kann er sich anders verhalten.",
      "Un contrato cuyo código se puede cambiar. Hoy puede ser justo y comportarse distinto tras una actualización.",
      "代码可以被替换的合约。今天也许没问题，升级后可能表现完全不同。",
    ),
    sections: [
      {
        h: H_WHY,
        p: L(
          "Проверка кода показывает, что контракт делает сейчас. Если его можно обновить, эта проверка ничего не гарантирует на завтра: владелец может выкатить новую версию с комиссией 99% или запретом продаж.",
          "A code review shows what the contract does now. If it can be upgraded, that review guarantees nothing for tomorrow: the owner could deploy a new version with a 99% tax or a sell ban.",
          "Eine Code-Prüfung zeigt, was der Contract jetzt tut. Ist er upgradebar, garantiert diese Prüfung nichts für morgen: Der Owner könnte eine neue Version mit 99 % Steuer oder Verkaufsverbot ausrollen.",
          "Revisar el código muestra lo que hace el contrato ahora. Si se puede actualizar, esa revisión no garantiza nada para mañana: el propietario podría desplegar una versión con un impuesto del 99 % o una prohibición de venta.",
          "代码审查只能说明合约现在做什么。如果它可以升级，这次审查对明天没有任何保证：所有者可能部署带 99% 税费或禁止卖出的新版本。",
        ),
      },
      {
        h: H_HOW,
        p: L(
          "Прокси — нормальная практика для крупных проектов и токенизированных активов, где обновлением управляет мультиподпись с задержкой (timelock). Для мемкоина с одним владельцем-кошельком это повод насторожиться.",
          "Proxies are normal for large projects and tokenized assets, where upgrades are controlled by a multisig with a delay (timelock). For a memecoin with a single wallet owner it is a reason to be careful.",
          "Proxies sind bei großen Projekten und tokenisierten Assets normal, wo Upgrades von einer Multisig mit Verzögerung (Timelock) gesteuert werden. Bei einem Memecoin mit einer einzelnen Owner-Wallet ist das ein Grund zur Vorsicht.",
          "Los proxies son normales en grandes proyectos y activos tokenizados, donde las actualizaciones las controla una multifirma con retraso (timelock). En una memecoin con un solo propietario-wallet es motivo de cautela.",
          "对大型项目和代币化资产来说，代理很常见，升级由带延迟（timelock）的多签控制。但对于由单个钱包所有者控制的 Memecoin，就需要警惕。",
        ),
      },
    ],
    check: L(
      "QUVR Pulse определяет стандартные прокси (EIP-1967, beacon, минимальные прокси), показывает адрес реализации и администратора и проверяет, кошелёк это, контракт, мультиподпись или timelock.",
      "QUVR Pulse detects standard proxies (EIP-1967, beacon, minimal proxies), shows the implementation and admin addresses and checks whether the admin is a wallet, a contract, a multisig or a timelock.",
      "QUVR Pulse erkennt Standard-Proxies (EIP-1967, Beacon, Minimal Proxies), zeigt die Implementierungs- und Admin-Adresse und prüft, ob der Admin eine Wallet, ein Contract, eine Multisig oder ein Timelock ist.",
      "QUVR Pulse detecta proxies estándar (EIP-1967, beacon, proxies mínimos), muestra las direcciones de implementación y administrador y comprueba si el administrador es una wallet, un contrato, una multifirma o un timelock.",
      "QUVR Pulse 识别标准代理（EIP-1967、beacon、最小代理），显示实现合约和管理员地址，并检查管理员是钱包、合约、多签还是 timelock。",
    ),
    faq: [
      {
        q: L(
          "Отказ от владения (renounce) решает проблему прокси?",
          "Does renouncing ownership solve the proxy problem?",
          "Löst ein Renounce das Proxy-Problem?",
          "¿Renunciar a la propiedad resuelve el problema del proxy?",
          "放弃所有权（renounce）能解决代理问题吗？",
        ),
        a: L(
          "Не всегда: у прокси часто отдельный администратор обновлений. Нужно смотреть, кто может обновлять реализацию, а не только кто владелец токена.",
          "Not always: a proxy often has a separate upgrade admin. You need to check who can upgrade the implementation, not only who owns the token.",
          "Nicht immer: Ein Proxy hat oft einen eigenen Upgrade-Admin. Man muss prüfen, wer die Implementierung aktualisieren kann, nicht nur, wem der Token gehört.",
          "No siempre: un proxy suele tener un administrador de actualizaciones aparte. Hay que ver quién puede actualizar la implementación, no solo quién es el propietario del token.",
          "不一定：代理合约通常有单独的升级管理员。需要看谁能升级实现合约，而不仅仅是谁拥有代币。",
        ),
      },
    ],
  },
];

export function termBySlug(slug: string): Term | undefined {
  return TERMS.find((t) => t.slug === slug);
}

/** Glossary term explaining a finding code (exact match, or prefix entries ending with "."). */
export function termForCode(code: string): Term | undefined {
  return TERMS.find((t) =>
    t.codes.some((c) =>
      c.endsWith(".") ? code.startsWith(c) : code === c || code.startsWith(`${c}.`),
    ),
  );
}
