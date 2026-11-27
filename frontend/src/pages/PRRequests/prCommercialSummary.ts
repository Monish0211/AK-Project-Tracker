import type { PRRequestProjectData } from "../../types/PRRequest";
import { calculateQuantity, createEmptyQuantityItem, recalcQuantityItem, sumTransactionCurrencyValue } from "../../utils/quantityCalculations";
import { LEGACY_REGIONAL_CURRENCY } from "../../utils/currencyDisplay";

/**
 * The Work Order Value shown on the PR detail page (Nov 2026): what the approver is about to turn into a Project, in the region's currency and, when
 * the lines are priced in another currency, in that transaction currency with the exchange rate applied.
 *
 * Nothing here is a new formula. The saved request holds only the raw inputs (quantity, unit rate, currency, exchange rate), so each line is priced with the
 * SAME function the review form and the backend use (recalcQuantityItem -> priceQuantityLine, which mirrors the backend's computeQuantityAmounts), the lines
 * are added with the SAME aggregator (calculateQuantity / sumTransactionCurrencyValue), and each line is priced with ITS OWN saved currency and rate - exactly what
 * approval will create. The request's regional currency comes from its country (the server looks it up from the PR Category); nothing is inferred from the
 * currency of the amounts. No second conversion and no INR hop is introduced: a regional amount is the saved transaction amount times the saved rate.
 */

export type RateProblem = "missing" | "one";

export interface TransactionGroup {
  /** The currency these lines are priced in (never the regional currency). */
  currency: string;
  /** The lines' total in that currency, exactly as entered (quantity x unit rate, a LUMP SUM line counting its unit rate once). */
  transactionTotal: number;
  /** The saved rate, "1 <currency> = <rate> <regional currency>"; null when it is missing or the lines carry different rates. */
  exchangeRate: number | null;
  /** The lines of this currency carry more than one rate. */
  ratesVary: boolean;
  /** "missing": no usable rate was saved. "one": a rate of exactly 1 between two different currencies, which approval refuses. */
  rateProblem: RateProblem | null;
}

export type PRCommercialSummary =
  /** No line is priced yet. */
  | { kind: "empty"; regionalCurrency: string }
  /** Every priced line is in the regional currency: one value, nothing to convert. */
  | { kind: "same"; regionalCurrency: string; total: number }
  /** At least one line is priced in another currency: the regional value, each transaction value and the rate applied. */
  | {
      kind: "different";
      regionalCurrency: string;
      /** The whole Work Order Value in the regional currency; null when a rate is missing, so a figure that would be wrong is never shown. */
      regionalTotal: number | null;
      /** Lines priced in the regional currency itself, when the request mixes them with foreign ones. */
      nativeTotal: number | null;
      groups: TransactionGroup[];
    };

const round6 = (value: number): number => Math.round(value * 1e6) / 1e6;

export function buildPRCommercialSummary(projectData: PRRequestProjectData, regionalCurrency: string | null | undefined): PRCommercialSummary {
  // A category without a configured country is a legacy-style INR request everywhere else in the portal; the same fallback is used here.
  const regional = regionalCurrency || LEGACY_REGIONAL_CURRENCY;

  // The saved lines, each priced with its OWN saved currency and rate - exactly how approval creates the Project's Quantity lines (createQuantityForProject).
  // They are read straight from the request: the review form's loader flattens every line to the request's single project currency and rate, which would
  // hide a line saved in another currency.
  const lines = (projectData.quantityItems ?? [])
    .filter((saved) => saved.unitRate > 0)
    .map((saved) =>
      recalcQuantityItem(
        { ...createEmptyQuantityItem(), woQty: saved.woQty, uom: saved.uom, unitRate: saved.unitRate, currency: saved.currency, exchangeRate: saved.exchangeRate },
        saved.currency || projectData.currency,
        Number(saved.exchangeRate), // a missing rate must stay unusable (NaN), not fall back to the helper's default of 1
        regionalCurrency || null
      )
    );

  if (lines.length === 0) return { kind: "empty", regionalCurrency: regional };

  const totals = calculateQuantity(lines, lines[0]!.currency, 1, false, regionalCurrency || null);
  const regionalTotal = round6(totals.workOrderValueRegional);

  const foreign = lines.filter((line) => line.currency !== regional);
  if (foreign.length === 0) return { kind: "same", regionalCurrency: regional, total: regionalTotal };

  const groups: TransactionGroup[] = [...new Set(foreign.map((line) => line.currency))].sort().map((currency) => {
    const inCurrency = foreign.filter((line) => line.currency === currency);
    const rates = [...new Set(inCurrency.map((line) => line.exchangeRate))];
    const ratesVary = rates.length > 1;
    const rate = ratesVary ? null : rates[0] ?? null;
    const usable = rate !== null && Number.isFinite(rate) && rate > 0;
    return {
      currency,
      transactionTotal: round6(sumTransactionCurrencyValue(inCurrency)),
      exchangeRate: usable ? rate : null,
      ratesVary,
      rateProblem: ratesVary ? null : !usable ? "missing" : rate === 1 ? "one" : null,
    };
  });

  const incomplete = foreign.some((line) => !(Number.isFinite(line.exchangeRate) && line.exchangeRate > 0));
  const native = lines.filter((line) => line.currency === regional);
  return {
    kind: "different",
    regionalCurrency: regional,
    regionalTotal: incomplete ? null : regionalTotal,
    nativeTotal: native.length > 0 ? round6(sumTransactionCurrencyValue(native)) : null,
    groups,
  };
}
