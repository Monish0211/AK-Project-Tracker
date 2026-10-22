import { isValidMonth, yearOptions } from "./trackerFormat";

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const selectClass =
  "h-9 px-2.5 rounded-[var(--nu-radius-md)] border border-[var(--nu-border)] bg-[var(--nu-surface-alt)] text-[12.5px] text-[var(--nu-text)] outline-none focus:ring-2 focus:ring-[var(--nu-accent)]/30 focus:border-[var(--nu-accent)]";

/**
 * Month + year selector (the month INVOICE DATES are filtered by) bound to ONE value ("YYYY-MM") — the same value the URL, the API request, the summary cards and the
 * table use. Two native selects (instead of <input type="month">) so the control always displays exactly the selected
 * month in every browser, and a half-typed year can never leave it showing a different month than the report.
 */
export function MonthSelect({ value, onChange, currentYear }: { value: string; onChange: (month: string) => void; currentYear: number }) {
  const [yearText, monthText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  return (
    <div role="group" aria-label="Invoice date month" className="flex items-center gap-1.5 mt-1" data-month-select data-value={value}>
      <select
        className={selectClass}
        value={month}
        onChange={(e) => {
          const next = `${yearText}-${String(Number(e.target.value)).padStart(2, "0")}`;
          if (isValidMonth(next)) onChange(next);
        }}
        aria-label="Month"
      >
        {MONTH_NAMES.map((name, i) => (
          <option key={name} value={i + 1}>
            {name}
          </option>
        ))}
      </select>
      <select
        className={selectClass}
        value={year}
        onChange={(e) => {
          const next = `${e.target.value}-${monthText}`;
          if (isValidMonth(next)) onChange(next);
        }}
        aria-label="Year"
      >
        {yearOptions(year, currentYear).map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
    </div>
  );
}
