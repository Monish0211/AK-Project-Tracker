import { Banknote, IndianRupee } from "lucide-react";

/**
 * The money icon type for an amount's currency. The rupee glyph is itself a currency symbol, so it is used only for INR; every other currency gets a
 * neutral banknote, never a rupee sign beside an OMR, MYR, AED or QAR figure. (A plain function in its own file: a component file may only export components.)
 */
export function currencyIconFor(currency: string | null | undefined): typeof IndianRupee {
  return !currency || currency === "INR" ? IndianRupee : Banknote;
}
