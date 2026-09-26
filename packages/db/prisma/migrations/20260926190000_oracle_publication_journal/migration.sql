CREATE TABLE "OracleDayBudget" (
    "day" TEXT NOT NULL PRIMARY KEY,
    "used" INTEGER NOT NULL
);
CREATE TABLE "OraclePublication" (
    "hash" TEXT NOT NULL PRIMARY KEY,
    "chainId" INTEGER NOT NULL,
    "oracle" TEXT NOT NULL,
    "rawTransaction" TEXT NOT NULL,
    "labels" JSONB NOT NULL,
    "labelCount" INTEGER NOT NULL,
    "day" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3)
);
CREATE INDEX "OraclePublication_status_createdAt_idx" ON "OraclePublication"("status", "createdAt");
