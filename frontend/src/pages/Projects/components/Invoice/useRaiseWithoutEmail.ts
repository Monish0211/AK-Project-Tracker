import { useCallback, useState } from "react";
import { useAdminRights } from "../../../../hooks/useAdminRights";
import { INVOICE_ADMINISTRATION } from "../../../../services/adminControlsService";
import { usePmoToast } from "../../../../components/ui/usePmoToast";

/**
 * Administrative Controls - "Raise invoice without sending email". ONE implementation shared by Edit Project -> Invoices and Invoice Tracker.
 *
 *  - Shown only to Invoice Administration holders. The server checks the right again on every write that carries the flag (403 otherwise),
 *    so this is never the authority.
 *  - Turning it on does nothing by itself. It applies to the invoices RAISED by the next successful save and then switches itself off.
 *    A save that raises nothing (an ordinary draft edit) or a save that fails leaves it on.
 */
export interface RaiseWithoutEmailState {
  /** The user may use the option (Invoice Administration). */
  available: boolean;
  /** On, and available: what the save path should send. */
  active: boolean;
  enabled: boolean;
  setEnabled: (on: boolean) => void;
  /** Called by the save path after a successful save that raised `count` invoice line(s) with the option on. */
  consume: (count: number) => void;
}

export function useRaiseWithoutEmail(): RaiseWithoutEmailState {
  const { holds } = useAdminRights();
  const { showToast } = usePmoToast();
  const available = holds(INVOICE_ADMINISTRATION);
  const [enabled, setEnabled] = useState(false);
  const consume = useCallback(
    (count: number) => {
      if (count <= 0) return;
      setEnabled(false);
      showToast({
        type: "success",
        title: "Raised without email",
        message: `${count} invoice line${count === 1 ? "" : "s"} raised without the automatic email. Recorded in the invoice history. The option is now off.`,
      });
    },
    [showToast]
  );
  return { available, active: available && enabled, enabled, setEnabled, consume };
}
