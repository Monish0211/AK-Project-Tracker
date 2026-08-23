/**
 * Shared shapes reused across the Quantity module's layers (repository,
 * service, controller) — mirrors how project.repository.ts's
 * ProjectGeneralInfoData is the one shape every layer of Projects agrees on.
 * Each QuantityItem belongs to exactly one Project (see schema.prisma's
 * Project.quantityItems / QuantityItem.projectId relation).
 */
export interface QuantityItemData {
  description: string;

  woQty: number;

  uom: string;
  assignedTo?: string | null;

  currency: string;

  unitRate: number;
  exchangeRate: number;
  unitRateINR: number;

  woValue: number;
}
