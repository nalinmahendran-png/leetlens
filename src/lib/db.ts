import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSQLite3 } from "@prisma/adapter-better-sqlite3";

/**
 * SQLite by default so `npm run dev` works with zero setup.
 * The Prisma CLI resolves "file:./dev.db" relative to the prisma/ folder, so we do the same
 * here -- the app and `prisma db push` then use the SAME file.
 *
 * To move to PostgreSQL: see "Switching to PostgreSQL" in the README.
 */
function sqliteUrl(): string {
  const raw = process.env.DATABASE_URL ?? "file:./dev.db";
  if (!raw.startsWith("file:")) {
    throw new Error(
      `DATABASE_URL is "${raw}", but this project is set up for SQLite. ` +
        `Use a "file:" URL, or follow "Switching to PostgreSQL" in the README.`,
    );
  }
  const filePath = raw.slice("file:".length);
  const abs = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), "prisma", filePath);
  return `file:${abs}`;
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db: PrismaClient =
  globalForPrisma.prisma ?? new PrismaClient({ adapter: new PrismaBetterSQLite3({ url: sqliteUrl() }) });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
