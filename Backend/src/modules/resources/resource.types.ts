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
export interface ProjectResourceData {
  employeeNo: string;

  assignmentStartDate?: Date | null;
  assignmentEndDate?: Date | null;
  assignmentStatus: string;

  hourlyRateSnapshot: number;

  workingDays: number;
  totalHours: number;

  manhourCost: number;

  lastSyncedAt?: Date | null;
}
