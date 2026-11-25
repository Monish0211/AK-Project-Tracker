import { Button } from "../../../components/ui/Button";

/** Shown while the country's currency is not known yet, and with a Retry if the list could not be loaded. */
const CurrencyPending = ({ failed, onRetry }: { failed: boolean; onRetry: () => void }) => (
  <div role="status" data-testid="currency-pending" className="flex flex-wrap items-center gap-3 text-[12.5px] text-[var(--nu-text-muted)] py-2">
    <span className={failed ? "text-[var(--nu-danger)]" : ""}>
      {failed ? "The country's currency could not be loaded. Check the connection and retry." : "Loading the country's currency..."}
    </span>
    {failed && (
      <Button type="button" variant="outline" size="sm" onClick={onRetry}>
        Retry
      </Button>
    )}
  </div>
);

export default CurrencyPending;
