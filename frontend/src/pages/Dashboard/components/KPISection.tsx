import {
  Banknote,
  IndianRupee,
  FileText,
  Wallet,
  Receipt,
  Percent,
  Landmark,
} from "lucide-react";

import { StatTile } from "../../../components/ui/StatTile";
import { formatMoneyCompact } from "../../../utils/currencyDisplay";
import { useDashboardSummary } from "../DashboardSummaryContext";
import { CurrencyGroupSummary } from "./CurrencyGroupSummary";

const KPISection = () => {
  const { kpis, kpiCurrency = "INR", otherCurrencies = [] } = useDashboardSummary();
  // Phase 3: the totals are in ONE currency (INR whenever INR or legacy projects are in view, so the India dashboard reads exactly as before;
  // otherwise the project country's regional currency, e.g. OMR for an Oman view). Other currencies are listed below, never added in.
  const money = (value: number) => formatMoneyCompact(value, kpiCurrency);
  // Phase 4 / Option A: projects (in any currency group) whose manpower recalculation after an employee-rate change is pending or failed.
  const refreshPending = (kpis.manhourRefreshPendingProjects ?? 0) + otherCurrencies.reduce((sum, c) => sum + (c.manhourRefreshPendingProjects ?? 0), 0);

  // Unbilled — portion of Work Order Value not yet invoiced. Reuses the same
  // two dashboard-summary KPI values the Work Order Value and Invoice Raised
  // tiles already render (kpis.totalWOValue / kpis.totalInvoiceRaised); no
  // second invoice calculation system, no backend change. This is a distinct
  // figure from the existing "Outstanding" KPI (totalWOValue -
  // totalPaymentReceived, i.e. amount not yet collected), which conflates
  // unbilled work with billed-but-unpaid invoices. The formula here matches
  // the app's existing "Balance to Invoice" / pendingDueINR definition used
  // elsewhere (project.service.ts's computeCommercialTotalsByProjectId()).
  const totalUnbilled = Math.max(kpis.totalWOValue - kpis.totalInvoiceRaised, 0);

  // Billed In % — how much of Work Order Value has been invoiced so far.
  // Same reused values as Unbilled; clamped to 0–100% since it represents a
  // share of Work Order Value (unlike Profit %, which is intentionally
  // allowed to go negative for a loss-making portfolio).
  const billedInPercent =
    kpis.totalWOValue === 0
      ? 0
      : Math.min(100, Math.max(0, (kpis.totalInvoiceRaised / kpis.totalWOValue) * 100));

  return (
    // auto-fit + minmax lets the browser decide column count purely from
    // available width (never fewer than ~170px per tile, never more columns
    // than the 6 tiles below), so it scales smoothly across 1366px laptops
    // through 4K monitors instead of jumping at fixed breakpoints.
    <>
    <div className="grid gap-3.5 grid-cols-[repeat(auto-fit,minmax(170px,1fr))]">
      <StatTile label="Work Order Value" value={money(kpis.totalWOValue)} rawValue={kpis.totalWOValue} currency={kpiCurrency} icon={kpiCurrency === "INR" ? <IndianRupee size={16} /> : <Banknote size={16} />} tint="success" footnote={kpiCurrency === "INR" ? "From Dashboard summary" : `In ${kpiCurrency}`} />
      <StatTile label="Unbilled" value={money(totalUnbilled)} rawValue={totalUnbilled} currency={kpiCurrency} icon={<Wallet size={16} />} tint="danger" footnote="Work Order Value − Invoice Raised" />
      <StatTile label="Invoice Raised" value={money(kpis.totalInvoiceRaised)} rawValue={kpis.totalInvoiceRaised} currency={kpiCurrency} icon={<FileText size={16} />} tint="info" footnote="From Dashboard summary" />
      <StatTile label="Payment Received" value={money(kpis.totalPaymentReceived)} rawValue={kpis.totalPaymentReceived} currency={kpiCurrency} icon={<Landmark size={16} />} tint="accent" footnote="From Dashboard summary" />
      <StatTile label="Actual Project Cost" value={money(kpis.totalActualProjectCost)} rawValue={kpis.totalActualProjectCost} currency={kpiCurrency} icon={<Receipt size={16} />} tint="warning" footnote="Manhour + Other Expenses" />
      <StatTile label="Billed In %" value={`${billedInPercent.toFixed(2)} %`} icon={<Percent size={16} />} tint="indigo" footnote="Invoice Raised ÷ Work Order Value" />
    </div>
    {refreshPending > 0 && (
      <p className="mt-2 text-[11.5px] text-amber-800 dark:text-amber-300" data-testid="manhour-refresh-pending" role="alert">
        Manpower costing recalculation is pending or failed for {refreshPending} project{refreshPending === 1 ? "" : "s"}, so their man-hour figures may be out of date (open the project to retry).
      </p>
    )}
    {/* More than one currency in view (All Countries): the complete six-figure summary of every currency, each on its own. */}
    <CurrencyGroupSummary />
    </>
  );
};

export default KPISection;
