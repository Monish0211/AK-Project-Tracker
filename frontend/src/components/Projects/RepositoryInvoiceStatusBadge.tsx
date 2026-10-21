/**
 * The Project Repository's Invoice Status pill, shared with Invoice Tracker (Oct 2026). Markup is the exact pill that
 * used to be built inline in Projects.tsx. See repositoryInvoiceStatus.ts for what the status means (invoiced share,
 * not payment).
 */
export function RepositoryInvoiceStatusBadge({ status }: { status: string }) {
  let cls = "bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-300";
  let dot = "bg-orange-500";
  if (status === "Paid") {
    cls = "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-300";
    dot = "bg-emerald-500";
  } else if (status === "Not Started") {
    cls = "bg-red-50 text-red-700 dark:bg-red-950/20 dark:text-red-300";
    dot = "bg-red-500";
  }
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`}></span>
      {status}
    </span>
  );
}
