/**
 * Converts a number to Indian Rupee Words format (Lakhs, Crores, Thousands)
 * e.g., 5871021.33 => "INR Fifty Eight Lakh Seventy One Thousand Twenty One and Thirty Three Paise Only"
 */

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
  "Seventeen", "Eighteen", "Nineteen"
];

const TENS = [
  "", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"
];

function convertBelowThousand(n: number): string {
  let str = "";
  if (n >= 100) {
    str += ONES[Math.floor(n / 100)] + " Hundred ";
    n %= 100;
  }
  if (n >= 20) {
    str += TENS[Math.floor(n / 10)] + " ";
    n %= 10;
  }
  if (n > 0) {
    str += ONES[n] + " ";
  }
  return str.trim();
}

export function numberToIndianWords(amount: number): string {
  if (isNaN(amount) || amount === 0) {
    return "INR Zero Only";
  }

  const rounded = Math.round(amount * 100) / 100;
  const rupees = Math.floor(rounded);
  const paise = Math.round((rounded - rupees) * 100);

  let rupeesStr = "";
  let rem = rupees;

  const crore = Math.floor(rem / 10000000);
  rem %= 10000000;

  const lakh = Math.floor(rem / 100000);
  rem %= 100000;

  const thousand = Math.floor(rem / 1000);
  rem %= 1000;

  if (crore > 0) {
    rupeesStr += convertBelowThousand(crore) + " Crore ";
  }
  if (lakh > 0) {
    rupeesStr += convertBelowThousand(lakh) + " Lakh ";
  }
  if (thousand > 0) {
    rupeesStr += convertBelowThousand(thousand) + " Thousand ";
  }
  if (rem > 0) {
    rupeesStr += convertBelowThousand(rem) + " ";
  }

  rupeesStr = rupeesStr.trim();

  let result = `INR ${rupeesStr}`;
  if (paise > 0) {
    result += ` and ${convertBelowThousand(paise)} Paise`;
  }
  result += " Only";

  return result;
}
