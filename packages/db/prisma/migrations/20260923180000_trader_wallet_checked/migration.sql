-- Negative cache for paid wallet lookups
ALTER TABLE "Trader" ADD COLUMN "walletCheckedAt" TIMESTAMP(3);
