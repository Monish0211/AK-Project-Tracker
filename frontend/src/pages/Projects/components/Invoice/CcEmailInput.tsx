import { useId, type ClipboardEvent, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import { FormLabel } from "../../../../components/ui/FormLabel";
import { Input } from "../../../../components/ui/Input";
import { MANDATORY_CC_EMAILS, MAX_ADDITIONAL_CC_EMAILS } from "../../../../utils/invoiceRequestCcEmails";

/**
 * "Additional CC Email Addresses": free-typed addresses (for people who are not PMO users), shown as removable chips. An address is added when
 * the user presses Enter, comma, semicolon or space, leaves the field, or pastes a list; invalid ones are reported by name and never added. This is a
 * controlled component: the form owns the list, the half-typed text and the messages, and applies the rules in utils/invoiceRequestCcEmails.ts.
 */
export function CcEmailInput({
  emails,
  draft,
  errors,
  disabled,
  onDraftChange,
  onCommit,
  onRemove,
}: {
  emails: readonly string[];
  draft: string;
  errors: readonly string[];
  disabled: boolean;
  onDraftChange: (text: string) => void;
  /** Add what was typed or pasted (the form validates, de-duplicates and reports). */
  onCommit: (text: string) => void;
  onRemove: (email: string) => void;
}) {
  const inputId = useId();
  const helpId = useId();
  const full = emails.length >= MAX_ADDITIONAL_CC_EMAILS;

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return; // an input-method composition in progress
    if ((event.key === "Enter" || event.key === "," || event.key === ";" || event.key === " ") && draft.trim().length > 0) {
      event.preventDefault();
      onCommit(draft);
    } else if (event.key === "Enter") {
      event.preventDefault(); // Enter in this field must never submit the whole request form
    }
  };
  const onPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const text = event.clipboardData.getData("text");
    if (/[\s,;]/.test(text.trim())) {
      event.preventDefault(); // a pasted list: add every address in it at once
      onCommit(text);
    }
  };

  return (
    <div data-testid="additional-cc-emails">
      <FormLabel htmlFor={inputId}>Additional CC Email Addresses</FormLabel>
      <Input
        id={inputId}
        type="text"
        inputMode="email"
        autoComplete="off"
        spellCheck={false}
        value={draft}
        disabled={disabled}
        invalid={errors.length > 0}
        placeholder={full ? `Maximum of ${MAX_ADDITIONAL_CC_EMAILS} addresses added` : "name@company.com — press Enter or comma to add"}
        aria-describedby={helpId}
        aria-invalid={errors.length > 0}
        onChange={(e) => onDraftChange(e.target.value)}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        onBlur={() => draft.trim().length > 0 && onCommit(draft)}
      />
      {emails.length > 0 && (
        <ul className="flex flex-wrap gap-1.5 mt-2" aria-label="Additional CC addresses added">
          {emails.map((email) => (
            <li key={email} className="max-w-full" data-cc-email={email}>
              <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-[var(--nu-accent-soft)] text-[var(--nu-accent)] pl-2.5 pr-1 py-1 text-[12px] font-medium">
                <span className="min-w-0 truncate" title={email}>
                  {email}
                </span>
                <button
                  type="button"
                  onClick={() => onRemove(email)}
                  disabled={disabled}
                  aria-label={`Remove ${email} from CC`}
                  className="shrink-0 rounded-full p-1 hover:bg-black/10 dark:hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--nu-accent)]/50 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <X size={11} aria-hidden="true" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {errors.length > 0 && (
        <ul role="alert" className="mt-2 space-y-1 text-[12px] text-red-600 dark:text-red-400" data-cc-errors>
          {errors.map((message, i) => (
            <li key={`${i}-${message}`} className="break-words">
              {message}
            </li>
          ))}
        </ul>
      )}
      <p id={helpId} className="text-[11px] text-[var(--nu-text-muted)] mt-1.5">
        For people outside the PMO user list. Anyone added here receives this email, including its attachments. {MANDATORY_CC_EMAILS.join(" and ")} are always included automatically.
        {emails.length > 0 ? ` ${emails.length} of ${MAX_ADDITIONAL_CC_EMAILS} added.` : ""}
      </p>
    </div>
  );
}
