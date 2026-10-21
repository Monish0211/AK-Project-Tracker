import type { TrackerInvoice } from "../../services/invoiceTrackerService";
import { describeEvent, formatDateOnly, formatInstant, sourceLabel } from "./trackerFormat";

/**
 * One invoice's recorded history, oldest first: previous → new status, who, exactly when (database time, shown in IST),
 * and which operation. An invoice that predates history tracking says so — no event is ever invented for it.
 */
export function InvoiceTimeline({ invoice }: { invoice: TrackerInvoice }) {
  return (
    <div className="space-y-1.5" data-timeline={invoice.key}>
      {invoice.invoiceRequest && (
        <p className="text-[11.5px] text-[var(--nu-text-secondary)]" data-request-link>
          Invoice request submitted {formatInstant(invoice.invoiceRequest.submittedAt)} by {invoice.invoiceRequest.submittedBy} — fulfilled by this invoice.
        </p>
      )}
      {invoice.timeline.length === 0 ? (
        <div data-state="no-history">
          <p className="text-[12px] font-semibold text-[var(--nu-text-muted)]">No recorded history</p>
          <p className="text-[11px] text-[var(--nu-text-muted)]">
            Entered in the portal {formatDateOnly(invoice.recordedInPortal.at)} by {invoice.recordedInPortal.by}. Status changes made before history tracking began were not captured.
          </p>
        </div>
      ) : (
        <ol className="space-y-1.5 border-l border-[var(--nu-border)] pl-3" aria-label={`History of invoice ${invoice.invoiceNo}`}>
          {invoice.timeline.map((e, i) => (
            <li key={`${e.occurredAt}-${i}`} className="relative text-[12px]" data-event={e.eventType}>
              <span className="absolute -left-[17px] top-1.5 h-2 w-2 rounded-full bg-[var(--nu-accent)]" aria-hidden="true" />
              <span className="font-semibold text-[var(--nu-text)]">{describeEvent(e)}</span>
              <span className="text-[var(--nu-text-secondary)]"> · {e.actorName}</span>
              <span className="text-[var(--nu-text-muted)]"> · {formatInstant(e.occurredAt)} · {sourceLabel(e.source)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
