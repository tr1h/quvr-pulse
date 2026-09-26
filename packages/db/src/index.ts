import { Prisma, PrismaClient } from "@prisma/client";

export { Prisma, PrismaClient };
export type * from "@prisma/client";

const globalForPrisma = globalThis as unknown as { __quvrPrisma?: PrismaClient };

/** Singleton (survives Next.js dev hot reloads). */
export function getDb(): PrismaClient {
  if (!globalForPrisma.__quvrPrisma) {
    globalForPrisma.__quvrPrisma = new PrismaClient({ log: ["error"] });
  }
  return globalForPrisma.__quvrPrisma;
}

export function isDbConfigured(): boolean {
  return !!process.env.DATABASE_URL;
}

/** JSON-safe conversion (BigInt → string) for Prisma Json columns. */
export function toJson<T>(value: T): Prisma.InputJsonValue {
  return JSON.parse(
    JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? v.toString() : v)),
  ) as Prisma.InputJsonValue;
}
