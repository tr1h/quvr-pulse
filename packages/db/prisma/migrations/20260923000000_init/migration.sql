-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('info', 'low', 'medium', 'high', 'critical');

-- CreateEnum
CREATE TYPE "OwnerType" AS ENUM ('web', 'telegram');

-- CreateTable
CREATE TABLE "Token" (
    "address" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL DEFAULT 4663,
    "name" TEXT,
    "symbol" TEXT,
    "decimals" INTEGER,
    "totalSupply" DECIMAL(78,0),
    "imageUrl" TEXT,
    "links" JSONB,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastScannedAt" TIMESTAMP(3),
    "lastReport" JSONB,
    "socialLinksAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Token_pkey" PRIMARY KEY ("address")
);

-- CreateTable
CREATE TABLE "TokenContract" (
    "tokenAddress" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "bytecodeSize" INTEGER NOT NULL,
    "deployer" TEXT,
    "factory" TEXT,
    "creationTx" TEXT,
    "creationBlock" INTEGER,
    "createdAtChain" TIMESTAMP(3),
    "verified" BOOLEAN,
    "isProxy" BOOLEAN NOT NULL DEFAULT false,
    "implementation" TEXT,
    "owner" TEXT,
    "analysis" JSONB NOT NULL,
    "analyzedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TokenContract_pkey" PRIMARY KEY ("tokenAddress")
);

-- CreateTable
CREATE TABLE "TradingPair" (
    "pairAddress" TEXT NOT NULL,
    "tokenAddress" TEXT NOT NULL,
    "dexId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "quoteAddress" TEXT NOT NULL,
    "quoteSymbol" TEXT,
    "pairCreatedAt" TIMESTAMP(3),
    "hooks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TradingPair_pkey" PRIMARY KEY ("pairAddress")
);

-- CreateTable
CREATE TABLE "MarketSnapshot" (
    "id" BIGSERIAL NOT NULL,
    "tokenAddress" TEXT NOT NULL,
    "pairAddress" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "priceUsd" DOUBLE PRECISION,
    "priceNative" DOUBLE PRECISION,
    "marketCapUsd" DOUBLE PRECISION,
    "fdvUsd" DOUBLE PRECISION,
    "liquidityUsd" DOUBLE PRECISION,
    "volumeH24" DOUBLE PRECISION,
    "volumeH1" DOUBLE PRECISION,
    "buysH24" INTEGER,
    "sellsH24" INTEGER,
    "source" TEXT NOT NULL,
    "confidence" TEXT NOT NULL,

    CONSTRAINT "MarketSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiquiditySnapshot" (
    "id" BIGSERIAL NOT NULL,
    "tokenAddress" TEXT NOT NULL,
    "pairAddress" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "liquidityUsd" DOUBLE PRECISION,
    "activeLiquidity" TEXT,
    "sqrtPriceX96" TEXT,
    "impacts" JSONB,
    "source" TEXT NOT NULL,

    CONSTRAINT "LiquiditySnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HolderSnapshot" (
    "id" BIGSERIAL NOT NULL,
    "tokenAddress" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "blockNumber" INTEGER NOT NULL,
    "holdersCount" INTEGER,
    "top1" DOUBLE PRECISION,
    "top5" DOUBLE PRECISION,
    "top10" DOUBLE PRECISION,
    "top20" DOUBLE PRECISION,
    "deployerShare" DOUBLE PRECISION,
    "relatedShare" DOUBLE PRECISION,
    "topHolders" JSONB NOT NULL,
    "excluded" JSONB NOT NULL,
    "clusters" JSONB NOT NULL,
    "complete" BOOLEAN NOT NULL DEFAULT true,
    "source" TEXT NOT NULL,

    CONSTRAINT "HolderSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Wallet" (
    "address" TEXT NOT NULL,
    "isContract" BOOLEAN,
    "nonce" INTEGER,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "label" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("address")
);

-- CreateTable
CREATE TABLE "WalletRelation" (
    "id" BIGSERIAL NOT NULL,
    "fromAddress" TEXT NOT NULL,
    "toAddress" TEXT NOT NULL,
    "signal" TEXT NOT NULL,
    "evidence" TEXT NOT NULL,
    "tokenAddress" TEXT,
    "confidence" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletRelation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletTokenBalance" (
    "walletAddress" TEXT NOT NULL,
    "tokenAddress" TEXT NOT NULL,
    "balance" DECIMAL(78,0) NOT NULL,
    "blockNumber" INTEGER NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletTokenBalance_pkey" PRIMARY KEY ("walletAddress","tokenAddress")
);

-- CreateTable
CREATE TABLE "Trader" (
    "id" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "externalUserId" TEXT,
    "displayName" TEXT,
    "verified" BOOLEAN,
    "stats" JSONB,
    "qualityScore" DOUBLE PRECISION,
    "qualityTier" TEXT,
    "statsAt" TIMESTAMP(3),
    "source" TEXT NOT NULL DEFAULT 'fomoapi',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Trader_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TraderWallet" (
    "traderId" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "confirmed" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT NOT NULL,

    CONSTRAINT "TraderWallet_pkey" PRIMARY KEY ("traderId","walletAddress")
);

-- CreateTable
CREATE TABLE "Thesis" (
    "id" TEXT NOT NULL,
    "traderId" TEXT NOT NULL,
    "tokenAddress" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "likes" INTEGER,
    "isDev" BOOLEAN,
    "tradeUsd" DOUBLE PRECISION,
    "priceAtPublishNative" DOUBLE PRECISION,
    "priceAtPublishUsd" DOUBLE PRECISION,
    "outcome15m" DOUBLE PRECISION,
    "outcome1h" DOUBLE PRECISION,
    "outcome6h" DOUBLE PRECISION,
    "outcome24h" DOUBLE PRECISION,
    "source" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Thesis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradeSignal" (
    "id" TEXT NOT NULL,
    "traderId" TEXT,
    "tokenAddress" TEXT,
    "kind" TEXT NOT NULL,
    "tradeUsd" DOUBLE PRECISION,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL,
    "raw" JSONB,

    CONSTRAINT "TradeSignal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskFinding" (
    "id" BIGSERIAL NOT NULL,
    "tokenAddress" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "severity" "Severity" NOT NULL,
    "title" JSONB NOT NULL,
    "explanation" JSONB NOT NULL,
    "evidence" JSONB NOT NULL,
    "source" TEXT NOT NULL,
    "confidence" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RiskFinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoreSnapshot" (
    "id" BIGSERIAL NOT NULL,
    "tokenAddress" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contractSafety" INTEGER,
    "liquidityHealth" INTEGER,
    "distributionHealth" INTEGER,
    "socialMomentum" INTEGER,
    "details" JSONB NOT NULL,

    CONSTRAINT "ScoreSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Watchlist" (
    "id" TEXT NOT NULL,
    "ownerType" "OwnerType" NOT NULL,
    "ownerId" TEXT NOT NULL,
    "tokenAddress" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Watchlist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlertRule" (
    "id" TEXT NOT NULL,
    "watchlistId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "threshold" DOUBLE PRECISION,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AlertRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlertEvent" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT,
    "tokenAddress" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "severity" "Severity" NOT NULL,
    "title" JSONB NOT NULL,
    "body" JSONB NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),
    "deliveryError" TEXT,

    CONSTRAINT "AlertEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataSourceStatus" (
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "successRate" DOUBLE PRECISION,
    "p50LatencyMs" INTEGER,
    "p95LatencyMs" INTEGER,
    "calls" INTEGER NOT NULL DEFAULT 0,
    "failures" INTEGER NOT NULL DEFAULT 0,
    "lastSuccessAt" TIMESTAMP(3),
    "lastErrorAt" TIMESTAMP(3),
    "lastError" TEXT,
    "note" TEXT,
    "reporter" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DataSourceStatus_pkey" PRIMARY KEY ("source")
);

-- CreateTable
CREATE TABLE "IngestionCursor" (
    "key" TEXT NOT NULL,
    "blockNumber" INTEGER NOT NULL,
    "meta" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IngestionCursor_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "Token_chainId_lastScannedAt_idx" ON "Token"("chainId", "lastScannedAt");

-- CreateIndex
CREATE INDEX "TokenContract_codeHash_idx" ON "TokenContract"("codeHash");

-- CreateIndex
CREATE INDEX "TokenContract_deployer_idx" ON "TokenContract"("deployer");

-- CreateIndex
CREATE INDEX "TradingPair_tokenAddress_idx" ON "TradingPair"("tokenAddress");

-- CreateIndex
CREATE INDEX "MarketSnapshot_tokenAddress_timestamp_idx" ON "MarketSnapshot"("tokenAddress", "timestamp");

-- CreateIndex
CREATE INDEX "MarketSnapshot_pairAddress_timestamp_idx" ON "MarketSnapshot"("pairAddress", "timestamp");

-- CreateIndex
CREATE INDEX "LiquiditySnapshot_tokenAddress_timestamp_idx" ON "LiquiditySnapshot"("tokenAddress", "timestamp");

-- CreateIndex
CREATE INDEX "LiquiditySnapshot_pairAddress_timestamp_idx" ON "LiquiditySnapshot"("pairAddress", "timestamp");

-- CreateIndex
CREATE INDEX "HolderSnapshot_tokenAddress_timestamp_idx" ON "HolderSnapshot"("tokenAddress", "timestamp");

-- CreateIndex
CREATE INDEX "WalletRelation_toAddress_idx" ON "WalletRelation"("toAddress");

-- CreateIndex
CREATE UNIQUE INDEX "WalletRelation_fromAddress_toAddress_signal_tokenAddress_key" ON "WalletRelation"("fromAddress", "toAddress", "signal", "tokenAddress");

-- CreateIndex
CREATE INDEX "WalletTokenBalance_tokenAddress_balance_idx" ON "WalletTokenBalance"("tokenAddress", "balance");

-- CreateIndex
CREATE INDEX "WalletTokenBalance_walletAddress_timestamp_idx" ON "WalletTokenBalance"("walletAddress", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "Trader_handle_key" ON "Trader"("handle");

-- CreateIndex
CREATE INDEX "Thesis_tokenAddress_publishedAt_idx" ON "Thesis"("tokenAddress", "publishedAt");

-- CreateIndex
CREATE INDEX "Thesis_traderId_publishedAt_idx" ON "Thesis"("traderId", "publishedAt");

-- CreateIndex
CREATE INDEX "TradeSignal_traderId_timestamp_idx" ON "TradeSignal"("traderId", "timestamp");

-- CreateIndex
CREATE INDEX "TradeSignal_tokenAddress_timestamp_idx" ON "TradeSignal"("tokenAddress", "timestamp");

-- CreateIndex
CREATE INDEX "RiskFinding_severity_lastSeenAt_idx" ON "RiskFinding"("severity", "lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "RiskFinding_tokenAddress_code_key" ON "RiskFinding"("tokenAddress", "code");

-- CreateIndex
CREATE INDEX "ScoreSnapshot_tokenAddress_timestamp_idx" ON "ScoreSnapshot"("tokenAddress", "timestamp");

-- CreateIndex
CREATE INDEX "Watchlist_tokenAddress_idx" ON "Watchlist"("tokenAddress");

-- CreateIndex
CREATE UNIQUE INDEX "Watchlist_ownerType_ownerId_tokenAddress_key" ON "Watchlist"("ownerType", "ownerId", "tokenAddress");

-- CreateIndex
CREATE UNIQUE INDEX "AlertRule_watchlistId_kind_key" ON "AlertRule"("watchlistId", "kind");

-- CreateIndex
CREATE INDEX "AlertEvent_tokenAddress_createdAt_idx" ON "AlertEvent"("tokenAddress", "createdAt");

-- CreateIndex
CREATE INDEX "AlertEvent_createdAt_idx" ON "AlertEvent"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AlertEvent_ruleId_dedupeKey_key" ON "AlertEvent"("ruleId", "dedupeKey");

-- AddForeignKey
ALTER TABLE "TokenContract" ADD CONSTRAINT "TokenContract_tokenAddress_fkey" FOREIGN KEY ("tokenAddress") REFERENCES "Token"("address") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradingPair" ADD CONSTRAINT "TradingPair_tokenAddress_fkey" FOREIGN KEY ("tokenAddress") REFERENCES "Token"("address") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketSnapshot" ADD CONSTRAINT "MarketSnapshot_tokenAddress_fkey" FOREIGN KEY ("tokenAddress") REFERENCES "Token"("address") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketSnapshot" ADD CONSTRAINT "MarketSnapshot_pairAddress_fkey" FOREIGN KEY ("pairAddress") REFERENCES "TradingPair"("pairAddress") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiquiditySnapshot" ADD CONSTRAINT "LiquiditySnapshot_tokenAddress_fkey" FOREIGN KEY ("tokenAddress") REFERENCES "Token"("address") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiquiditySnapshot" ADD CONSTRAINT "LiquiditySnapshot_pairAddress_fkey" FOREIGN KEY ("pairAddress") REFERENCES "TradingPair"("pairAddress") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HolderSnapshot" ADD CONSTRAINT "HolderSnapshot_tokenAddress_fkey" FOREIGN KEY ("tokenAddress") REFERENCES "Token"("address") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletRelation" ADD CONSTRAINT "WalletRelation_fromAddress_fkey" FOREIGN KEY ("fromAddress") REFERENCES "Wallet"("address") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletRelation" ADD CONSTRAINT "WalletRelation_toAddress_fkey" FOREIGN KEY ("toAddress") REFERENCES "Wallet"("address") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletTokenBalance" ADD CONSTRAINT "WalletTokenBalance_walletAddress_fkey" FOREIGN KEY ("walletAddress") REFERENCES "Wallet"("address") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletTokenBalance" ADD CONSTRAINT "WalletTokenBalance_tokenAddress_fkey" FOREIGN KEY ("tokenAddress") REFERENCES "Token"("address") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TraderWallet" ADD CONSTRAINT "TraderWallet_traderId_fkey" FOREIGN KEY ("traderId") REFERENCES "Trader"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TraderWallet" ADD CONSTRAINT "TraderWallet_walletAddress_fkey" FOREIGN KEY ("walletAddress") REFERENCES "Wallet"("address") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Thesis" ADD CONSTRAINT "Thesis_traderId_fkey" FOREIGN KEY ("traderId") REFERENCES "Trader"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Thesis" ADD CONSTRAINT "Thesis_tokenAddress_fkey" FOREIGN KEY ("tokenAddress") REFERENCES "Token"("address") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeSignal" ADD CONSTRAINT "TradeSignal_traderId_fkey" FOREIGN KEY ("traderId") REFERENCES "Trader"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskFinding" ADD CONSTRAINT "RiskFinding_tokenAddress_fkey" FOREIGN KEY ("tokenAddress") REFERENCES "Token"("address") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreSnapshot" ADD CONSTRAINT "ScoreSnapshot_tokenAddress_fkey" FOREIGN KEY ("tokenAddress") REFERENCES "Token"("address") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Watchlist" ADD CONSTRAINT "Watchlist_tokenAddress_fkey" FOREIGN KEY ("tokenAddress") REFERENCES "Token"("address") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertRule" ADD CONSTRAINT "AlertRule_watchlistId_fkey" FOREIGN KEY ("watchlistId") REFERENCES "Watchlist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertEvent" ADD CONSTRAINT "AlertEvent_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "AlertRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertEvent" ADD CONSTRAINT "AlertEvent_tokenAddress_fkey" FOREIGN KEY ("tokenAddress") REFERENCES "Token"("address") ON DELETE CASCADE ON UPDATE CASCADE;

