/**
 * Future-ready placeholder for tracking a change to an Activity's contract
 * quantity after invoicing has begun against it. No mutation logic exists
 * yet — this type only backs the "Quantity Revisions" placeholder section
 * in Invoice History (see InvoiceHistory.tsx) so the layout doesn't need to
 * change when this is wired up to a real workflow later.
 */
export interface QuantityRevision {
  id: string;
  activityId: string;
  previousQty: number;
  currentQty: number;
  reason: string;
  date: string;
}
