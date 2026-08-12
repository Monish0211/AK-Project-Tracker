/**
 * Shared shapes reused across the Milestones module's layers — mirrors
 * quantity.types.ts's QuantityItemData. `amount` is deliberately absent:
 * it is never stored, always derived from paymentPercentage and the
 * parent project's Work Order Value (see milestone.service.ts).
 */
export interface MilestoneData {
  milestoneName: string;
  paymentPercentage: number;
  dueDate?: Date | null;
}
