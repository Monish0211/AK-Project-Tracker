import { createContext, useContext, useMemo } from "react";
import { moneyFormatter } from "../../utils/currencyDisplay";
import type { MoneyFormatter } from "../../utils/currencyDisplay";
import type { ReportGroupInfo } from "./reportCurrency";

/**
 * The country group a report section is rendering (Phase 3). Every report component formats its amounts through useReportMoney(), so the same
 * component reads ₹ for India, RM for Malaysia and OMR / AED / QAR for the others, and its exports name the country and currency.
 * Outside a group the default is INR with no country, i.e. exactly the long-standing behaviour.
 */
export const DEFAULT_REPORT_GROUP: ReportGroupInfo = { currency: "INR", countryLabel: "", label: "" };

export const ReportGroupContext = createContext<ReportGroupInfo>(DEFAULT_REPORT_GROUP);

export function useReportGroup(): ReportGroupInfo {
  return useContext(ReportGroupContext);
}

/** The money formatter for the report group being rendered. */
export function useReportMoney(): MoneyFormatter {
  const { currency, countryKey } = useContext(ReportGroupContext);
  // Memoised per currency and country so the formatter's identity is stable and can sit in a useMemo dependency list.
  return useMemo(() => moneyFormatter(currency, countryKey), [currency, countryKey]);
}
