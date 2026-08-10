import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../../generated/prisma/client.js";
import { env } from "./env.js";

/**
 * Prisma 7 no longer connects directly from a datasource URL string — it
 * requires an explicit driver adapter instance. One PrismaClient per process
 * (not per-request) so connections are pooled by `pg`, not opened per call.
 */
const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });

export const prisma = new PrismaClient({ adapter });
