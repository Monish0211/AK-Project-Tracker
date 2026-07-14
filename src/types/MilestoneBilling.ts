/**
 * A commercial billing event raised against a Payment Milestone.
 * Completely independent of Quantity Based Billing (InvoiceEntry) — see
 * services/milestoneBillingService.ts. A milestone can only be billed once.
 */
export interface MilestoneBilling {
  id: string;

  milestoneId: string;

  /** Snapshot of the milestone's name/percentage at billing time, so history stays accurate even if the milestone is edited later. */
  milestoneName: string;
  milestonePercentage: number;

  amount: number;

  invoiceDate: string;
}
