import { prisma } from "../../shared/utils/prismaClient.js";

/**
 * TEST-ONLY. A country conversion-rate version can never be edited or deleted (database trigger), which is exactly right in the product and awkward in a
 * shared scratch database: a test file that saves a rate would leave it behind for the next file. The tests therefore remove THEIR versions at the end by
 * switching the delete guard off for the duration of one statement. Refuses to run unless the connection is the scratch database.
 */
export async function purgeCountryRates(regionIds: string[]): Promise<void> {
  if (regionIds.length === 0) return;
  if (!(process.env["DATABASE_URL"] ?? "").includes("scratch")) throw new Error("purgeCountryRates is for the scratch test database only");
  await prisma.$executeRawUnsafe(`ALTER TABLE "CountryManhourFxRate" DISABLE TRIGGER "CountryManhourFxRate_no_delete"`);
  try {
    await prisma.countryManhourFxRate.deleteMany({ where: { regionId: { in: regionIds } } });
  } finally {
    await prisma.$executeRawUnsafe(`ALTER TABLE "CountryManhourFxRate" ENABLE TRIGGER "CountryManhourFxRate_no_delete"`);
  }
}
