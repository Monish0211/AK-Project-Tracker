import { Banknote, IndianRupee } from "lucide-react";

interface Props {
  currency?: string | null | undefined;
  size?: number;
  className?: string;
}

/** The money icon for an amount's currency: the rupee glyph only for INR, a neutral banknote for every other currency (see currencyIconFor). */
export const CurrencyIcon = ({ currency, size = 14, className }: Props) =>
  !currency || currency === "INR" ? (
    <IndianRupee size={size} {...(className ? { className } : {})} />
  ) : (
    <Banknote size={size} {...(className ? { className } : {})} />
  );

export default CurrencyIcon;
