# QUVR Pulse (описание на русском)

> English version: [README.md](../README.md).

Независимый сервис аналитики и оценки рисков токенов **Robinhood Chain** (chain id 4663), **Base** и **Solana**.

> QUVR Pulse is an independent analytics product and is not affiliated with or endorsed by Robinhood or Fomo.

Сервис **только читает данные пользователей**: не подключает кошельки, не хранит чужие ключи, не торгует, не копирует сделки и не выпускает токен QUVR. Единственные транзакции — запись собственных оценок в контракт QUVR Risk Oracle служебным ключом сервера (см. README на английском). Оценки — не инвестиционная рекомендация.

## Что умеет

- Вставляете адрес токена — получаете отчёт: контракт, ликвидность, распределение держателей, социальный хайп.
- Четыре **независимых** балла 0–100: Contract Safety, Liquidity Health, Distribution Health, Social Momentum. У каждого есть достоверность, покрытие, 3–5 причин и разбивка по компонентам. Формулировки: «Низкий обнаруженный риск», «Повышенный риск», «Высокий риск», «Недостаточно данных». Слова «Безопасно» в интерфейсе нет.
- У каждой цифры есть источник, время получения, признаки «устарело» и «оценка». Если источник не ответил, показывается **«Нет данных»**, а не ноль.
- Анализ контракта: байткод-диспетчер, прокси (EIP-1967/1167/beacon), владелец, timelock и мультиподпись, read-only пробы привилегий через `eth_call`, симуляция пути покупки и продажи.
- Распределение: баланс восстанавливается по Transfer-логам и сверяется через `balanceOf`. Показываются top 1/5/10/20, доля deployer, «возможно связанные кошельки», рост числа держателей, свежие кошельки, массовые рассылки. PoolManager, burn и лаунчпад исключаются из расчёта. EIP-7702-кошельки считаются кошельками, а не контрактами.
- Ликвидность: price impact для $100 / $1 000 / $5 000 по активной ликвидности пула v4/v3 (это оценка), net flow и история цены по on-chain Swap-событиям.
- Радар, наблюдение (watchlist), страница трейдера, «Точность оценок» (track record), закрытая `/admin/status` с метриками источников.
- Telegram-бот: `/scan`, `/watch`, `/unwatch`, `/trending`, автопроверка адресов в группах и уведомления.
- Интерфейс на 5 языках, адаптирован под телефон.

## Быстрый старт (Windows)

Нужно: **Node.js ≥ 20.11**, **Docker Desktop**, Git.

```powershell
npm install
docker compose up -d
npm run dev
```

Откройте http://localhost:3000 и вставьте тестовый адрес `0x4b7d1e5ec6889e63e70d39561edf925095dbed88`.

- `npm install` ставит зависимости и генерирует Prisma Client.
- `docker compose up -d` поднимает PostgreSQL (порт **5433**) и Redis (порт **6380**). Порты нестандартные, чтобы не конфликтовать с локальными установками.
- `npm run dev` сначала создаёт `.env` из `.env.example`, если его нет, ждёт PostgreSQL и применяет миграции. Затем запускает web (Next.js), worker (BullMQ) и Telegram-бота.

Ключи не обязательны. Без них сервис работает в режиме **onchain-only**: публичный RPC и Dexscreener.

### Первый скан токена

Публичный RPC пропускает примерно один тяжёлый `eth_getLogs` за 1,5 с. Поэтому полная история переводов крупного токена (у TOOLS около 45 тыс. событий) при первом скане грузится 1–2 минуты. Отчёт открывается сразу, а в блоке распределения стоит пометка «загрузка…». Страница обновляется сама, прогресс сохраняется в Redis, последующие сканы инкрементальные и занимают несколько секунд. С `ALCHEMY_API_KEY` загрузка быстрее.

## Переменные окружения (`.env`)

| Переменная                                                          | Назначение                                                                                                      |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                                      | PostgreSQL (по умолчанию docker-compose, порт 5433)                                                             |
| `REDIS_URL`                                                         | Redis (порт 6380). Используется для кэша, rate limit и BullMQ                                                   |
| `ROBINHOOD_RPC_URL`, `ROBINHOOD_CHAIN_ID`                           | RPC и сеть (4663 mainnet, 46630 testnet)                                                                        |
| `ALCHEMY_API_KEY`, `ALCHEMY_RPC_URL`                                | если задан ключ, RPC переключается на Alchemy                                                                   |
| `BLOCKSCOUT_API_KEY`                                                | Blockscout PRO API: верификация, исходник, эвристика общего источника финансирования                            |
| `FOMO_API_KEY`                                                      | FomoAPI.io (неофициальный независимый провайдер): тренды, тезисы, авторы. Без ключа работает режим onchain-only |
| `TELEGRAM_BOT_TOKEN`                                                | включает бота                                                                                                   |
| `TELEGRAM_MODE`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_WEBHOOK_PORT` | режим webhook с проверкой секрета                                                                               |
| `NEXT_PUBLIC_APP_URL`                                               | ссылки в сообщениях бота                                                                                        |

Все ключи используются только на сервере и маскируются в логах. `.env` исключён из Git.

## Команды

```powershell
npm run dev          # web + worker + bot (упавший процесс перезапускается автоматически)
npm test             # unit-тесты Vitest (scoring, провайдеры, кэш, алерты, бот)
npm run test:e2e     # Playwright (desktop + mobile), нужен запущенный стек или он поднимется сам
npm run typecheck    # TypeScript по всему монорепо
npm run lint         # ESLint
npm run probe        # живая проверка всех источников на тестовом токене
npx tsx scripts/scan.ts 0x…   # отчёт в консоли
npm run build        # production-сборка web
npm start            # production: web + worker + bot
```

Первый запуск Playwright: `npx playwright install chromium`.

## Архитектура

```
apps/web          Next.js 15 (App Router, Tailwind 4): страницы и API. Внешние API вызываются только на сервере
apps/worker       BullMQ: рынок 15 с · держатели и алерты 5 мин · трейдеры 15 мин · ссылки 6 ч · новые пулы 60 с · Fomo WS
apps/telegram     grammY-бот, long polling или webhook с secret token
packages/shared   SourcedValue, типы отчёта, Zod-схемы, адреса (lowercase/checksum), санитизация, JSON-логгер
packages/providers ChainProvider / ExplorerProvider / MarketProvider / SocialProvider + надёжность
packages/scoring  чистые функции: 4 балла, байткод, концентрация, связи, price impact, качество авторов
packages/services оркестрация отчёта, SWR-кэш, снапшоты, watchlist, алерты, статус
packages/db       Prisma-схема (20 моделей) и миграции
```

Подробности об источниках и их ограничениях: [DATA_SOURCES.md](DATA_SOURCES.md). Методика баллов: [SCORING.md](SCORING.md). Безопасность: [SECURITY.md](SECURITY.md).

## Известные ограничения

- **Blockscout** закрывает публичный API от серверных клиентов Cloudflare-челленджем. Обходить его мы не пытаемся. Без `BLOCKSCOUT_API_KEY` верификация исходника показывается как «Нет данных», а создатель токена находится через RPC по первому mint-событию.
- **Симуляция продажи** проверяет только `ERC20.transfer` по пути «держатель → пул» и «пул → новый кошелёк» через `eth_call`. Логика роутера, Permit2 и hook-контрактов не исполняется: `debug_*` на публичном RPC нет.
- **Price impact** считается по ликвидности активного тика, без пересечения тиков и комиссий hook. Всегда помечен как оценка.
- **Связи кошельков** — эвристика, а не доказательство общего владельца.
- **Social Momentum** и страницы трейдеров требуют `FOMO_API_KEY`. Социальная часть реализована по опубликованной OpenAPI-спецификации FomoAPI. Без ключа проверить её на живых данных не удалось, так что после подключения ключа её стоит прогнать отдельно.
- Если нативный SWC для Windows не загружается (обычно не установлен Microsoft Visual C++ Redistributable), Next.js автоматически переходит на WASM. Всё работает, только сборка медленнее.

## Docker Desktop на Windows

Если Docker Desktop падает с ошибкой `listening on unix://…\*.sock: remove …: The file cannot be accessed by the system`, значит после прошлого сбоя остались «мёртвые» AF_UNIX-сокеты. Закройте Docker Desktop и переименуйте папки `%LOCALAPPDATA%\Docker\run` и `%LOCALAPPDATA%\docker-secrets-engine` (Docker создаст их заново), затем запустите его снова. Если ошибка `invalid character 'ï'` указывает на `settings-store.json`, файл сохранён с BOM: пересохраните его в UTF-8 без BOM.
