import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * PostgreSQL via the `pg` driver adapter (the Prisma client is generated with engineType "client").
 * DATABASE_URL is a postgres:// connection string, e.g. from Neon. On serverless hosts use the
 * pooled connection string.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db: PrismaClient =
  globalForPrisma.prisma ?? new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
