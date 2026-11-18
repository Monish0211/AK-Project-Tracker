/**
 * Shared shapes reused across the Project Resource module's layers
 * (repository, service, controller) — mirrors quantity.types.ts's
 * QuantityItemData. Each ProjectResource belongs to exactly one Project (see
 * schema.prisma's Project.projectResources / ProjectResource.projectId
 * relation).
 *
 * `employeeNo` is deliberately a plain field here, not a relation to
 * Employee — see schema.prisma's ProjectResource model comment for why:
 * hourlyRateSnapshot exists specifically so a row's historical cost survives
 * independently of Employee Master's current state.
 */
import type { Prisma } from "../../../generated/prisma/client.js";

export interface ProjectResourceData {
  employeeNo: string;

  assignmentStartDate?: Date | null;
  assignmentEndDate?: Date | null;
  assignmentStatus: string;

  hourlyRateSnapshot: number;

  workingDays: number;
  totalHours: number;

  manhourCost: number;

  // Phase 4 - regional costing columns (see schema.prisma, ProjectResource). Set only by manhourSnapshot.ts; the INR fields above are unchanged.
  costCurrency?: string | null;
  costingStatus?: string | null;
  fxRateVersion?: number | null;
  fxRateInrPerRegional?: Prisma.Decimal | null;
  manhourCostRegional?: Prisma.Decimal | null;
  rateSetAt?: Date | null;

  lastSyncedAt?: Date | null;
}
