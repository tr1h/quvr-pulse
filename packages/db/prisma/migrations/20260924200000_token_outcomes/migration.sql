-- CreateTable
CREATE TABLE "TokenBaseline" (
    "tokenAddress" TEXT NOT NULL,
    "chain" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "backfilled" BOOLEAN NOT NULL DEFAULT false,
    "priceUsd" DOUBLE PRECISION,
    "liquidityUsd" DOUBLE PRECISION,
    "marketCapUsd" DOUBLE PRECISION,
    "poolAgeHours" DOUBLE PRECISION,
    "features" JSONB NOT NULL,

    CONSTRAINT "TokenBaseline_pkey" PRIMARY KEY ("tokenAddress")
);

-- CreateTable
CREATE TABLE "TokenOutcome" (
    "id" BIGSERIAL NOT NULL,
    "tokenAddress" TEXT NOT NULL,
    "horizon" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "delayMinutes" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "priceUsd" DOUBLE PRECISION,
    "liquidityUsd" DOUBLE PRECISION,
    "priceRatio" DOUBLE PRECISION,
    "liquidityRatio" DOUBLE PRECISION,

    CONSTRAINT "TokenOutcome_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TokenBaseline_capturedAt_idx" ON "TokenBaseline"("capturedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TokenOutcome_tokenAddress_horizon_key" ON "TokenOutcome"("tokenAddress", "horizon");

-- AddForeignKey
ALTER TABLE "TokenBaseline" ADD CONSTRAINT "TokenBaseline_tokenAddress_fkey" FOREIGN KEY ("tokenAddress") REFERENCES "Token"("address") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TokenOutcome" ADD CONSTRAINT "TokenOutcome_tokenAddress_fkey" FOREIGN KEY ("tokenAddress") REFERENCES "TokenBaseline"("tokenAddress") ON DELETE CASCADE ON UPDATE CASCADE;

