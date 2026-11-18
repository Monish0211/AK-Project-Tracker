import type { Prisma } from "../../../generated/prisma/client.js";
import { prisma } from "../../shared/utils/prismaClient.js";
import { decideRegionalSnapshot, requiresManhourRate } from "./manhourCurrency.rules.js";
import { findLatestCountryRate, findProjectBasics } from "./manhourRate.repository.js";

type Db = Prisma.TransactionClient | typeof prisma;

/** The regional columns of a ProjectResource row, ready to spread into a create or update. */
export interface RegionalColumns {
  costCurrency: string;
  costingStatus: string;
  fxRateVersion: number | null;
  fxRateInrPerRegional: Prisma.Decimal | null;
  manhourCostRegional: Prisma.Decimal | null;
  rateSetAt: Date | null;
  fxRateScope: string | null;
}

interface ExistingRegional {
  costingStatus: string | null;
  costCurrency: string | null;
  fxRateVersion: number | null;
  fxRateInrPerRegional: Prisma.Decimal | null;
  rateSetAt: Date | null;
  fxRateScope?: string | null;
}

/**
 * Phase 4 - the one place that turns a freshly computed INR man-hour cost into the regional columns stored beside it. The INR cost itself is
 * computed by the unchanged existing code and is never altered here. `existing` is the row as it stands (null for a brand-new row): a row that is
 * already CONVERTED keeps its rate version, a new row takes the latest COUNTRY rate of the project's country (its stored region, never the PR number),
 * anything else stays RATE_MISSING (see decideRegionalSnapshot). Called from the single backend write path for these rows (recomputeProjectResource),
 * from the employee-rate recalculation and from the manual resource API.
 */
export async function regionalSnapshotFields(projectId: string, inrCost: number, existing: ExistingRegional | null, db: Db = prisma): Promise<RegionalColumns> {
  const project = await findProjectBasics(projectId, db);
  const storedRegionalCurrency = project?.regionalCurrency ?? null;
  const needsRate = requiresManhourRate(storedRegionalCurrency);
  const latestRate = needsRate && project?.regionId ? await findLatestCountryRate(project.regionId, db) : null;
  const snapshot = decideRegionalSnapshot({
    storedRegionalCurrency,
    inrCost,
    existing,
    latestRate: latestRate
      ? { version: latestRate.version, inrPerRegionalUnit: latestRate.inrPerRegionalUnit, effectiveFrom: latestRate.effectiveFrom, regionalCurrency: latestRate.regionalCurrency }
      : null,
  });
  return {
    costCurrency: snapshot.costCurrency,
    costingStatus: snapshot.costingStatus,
    fxRateVersion: snapshot.fxRateVersion,
    fxRateInrPerRegional: snapshot.fxRateInrPerRegional,
    manhourCostRegional: snapshot.manhourCostRegional,
    rateSetAt: snapshot.rateSetAt,
    fxRateScope: snapshot.fxRateScope,
  };
}
