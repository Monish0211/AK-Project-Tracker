import cron from "node-cron";
import { env } from "../utils/env.js";
import { runUnpaidInvoiceJob } from "../../modules/weeklyNotifications/index.js";

/**
 * Weekly "Invoices Unpaid for 30+ Days" email (Oct 2026). Same in-process
 * node-cron approach and DB-level per-week lock (ScheduledJobRun, jobName
 * "unpaid_invoices_30_days") as missingExpenseScheduler.ts, so duplicate
 * ticks, restarts or extra instances never send twice. Delivery is gated by
 * UNPAID_INVOICE_EMAIL_ENABLED (default false).
 */

let started = false;

export function startUnpaidInvoiceScheduler(): void {
  if (started) {
    console.warn("[UnpaidInvoiceScheduler] startUnpaidInvoiceScheduler() called again in the same process — ignoring (already scheduled).");
    return;
  }
  if (!cron.validate(env.UNPAID_INVOICE_CRON)) {
    console.error(`[UnpaidInvoiceScheduler] Not scheduled — UNPAID_INVOICE_CRON "${env.UNPAID_INVOICE_CRON}" is not a valid cron expression.`);
    return;
  }
  started = true;

  cron.schedule(
    env.UNPAID_INVOICE_CRON,
    () => {
      void runUnpaidInvoiceJob({ trigger: "scheduled" }).catch((err: unknown) => {
        console.error("[UnpaidInvoiceScheduler] Unexpected error:", err instanceof Error ? err.message : err);
      });
    },
    { timezone: env.APP_TIMEZONE }
  );

  console.log(
    `[UnpaidInvoiceScheduler] Scheduled — weekly unpaid-invoice check at '${env.UNPAID_INVOICE_CRON}' (${env.APP_TIMEZONE}); ` +
      `email delivery ${env.UNPAID_INVOICE_EMAIL_ENABLED ? "ENABLED" : "disabled (UNPAID_INVOICE_EMAIL_ENABLED is not \"true\")"}.`
  );
}
