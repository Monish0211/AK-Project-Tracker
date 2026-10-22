import { useEffect, useRef, useState } from "react";
import { Paperclip, Send, X } from "lucide-react";
import type { Project } from "../../../../types/Project";
import type { EligibleInvoiceRaiser, InvoiceRequest } from "../../../../types/InvoiceRequest";
import type { UserByRole } from "../../../../types/PRRequest";
import { Button } from "../../../../components/ui/Button";
import { FormLabel } from "../../../../components/ui/FormLabel";
import { Input } from "../../../../components/ui/Input";
import { Select } from "../../../../components/ui/Select";
import { Textarea } from "../../../../components/ui/Textarea";
import { Portal } from "../../../../components/ui/Portal";
import { usePmoToast } from "../../../../components/ui/usePmoToast";
import { getUserFriendlyErrorMessage } from "../../../../utils/errorMessage";
import { createInvoiceRequest, getEligibleInvoiceRaisers } from "../../../../services/invoiceRequestService";
import { getUsersByRole } from "../../../../services/prRequestService";
import {
  ALLOWED_ATTACHMENT_LABELS,
  ATTACHMENT_ACCEPT,
  ATTACHMENT_LIMITS,
  addAttachments,
  emailSizeWarning,
  formatFileSize,
  totalAttachmentBytes,
} from "../../../../utils/invoiceRequestAttachments";

interface Props {
  project: Project;
  onClose: () => void;
  /** Passed the just-created request so the caller can update its "is one already Open" state directly from the POST response — no follow-up GET needed. */
  onSubmitted: (created: InvoiceRequest) => void;
}

/**
 * Request Invoice — Section A of the Request Invoice workflow. Lets an
 * Invoices-module user who does not hold the "Raise Invoice" permission
 * themselves ask a specific eligible responsible person to raise the
 * invoice instead. Client/PR/Project fields are read-only, sourced straight
 * from the already-loaded `project` prop — never a second, independently
 * editable copy. The "Send Invoice To" list is fetched fresh from the
 * eligibility-filtered backend lookup (active users who currently hold
 * "Raise Invoice") every time this opens, never a cached/stale list.
 */
export function RequestInvoiceModal({ project, onClose, onSubmitted }: Props) {
  const { showToast } = usePmoToast();
  const [eligibleUsers, setEligibleUsers] = useState<EligibleInvoiceRaiser[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  const [assignedToUserId, setAssignedToUserId] = useState("");
  // CC Members — any active PMO user (same "every active user" source the
  // existing post-raise "Send Invoice To" action already uses), deliberately
  // NOT restricted to Raise-Invoice holders like "Send Invoice To" above —
  // this is plain email distribution, never a raise-permission grant.
  const [allActiveUsers, setAllActiveUsers] = useState<UserByRole[]>([]);
  const [isLoadingCcUsers, setIsLoadingCcUsers] = useState(true);
  const [ccMemberUserIds, setCcMemberUserIds] = useState<string[]>([]);
  // Matches the team's existing manual "raise the invoice" email template's
  // field set — all free text, all optional.
  const [invoiceAmountNote, setInvoiceAmountNote] = useState("");
  const [copiesRequired, setCopiesRequired] = useState("");
  const [drawingsAvailable, setDrawingsAvailable] = useState("");
  const [printingDetails, setPrintingDetails] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Optional attachments — kept in the form only until Send Request; the backend stores them with the request and emails them.
  const [attachments, setAttachments] = useState<File[]>([]);
  const [attachmentErrors, setAttachmentErrors] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    getEligibleInvoiceRaisers()
      .then((users) => {
        if (!cancelled) setEligibleUsers(users);
      })
      .catch((error) => {
        if (!cancelled) {
          showToast({ type: "error", title: "Failed to load eligible users", message: getUserFriendlyErrorMessage(error) });
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingUsers(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    getUsersByRole()
      .then((users) => {
        if (!cancelled) setAllActiveUsers(users);
      })
      .catch((error) => {
        if (!cancelled) {
          showToast({ type: "error", title: "Failed to load CC member list", message: getUserFriendlyErrorMessage(error) });
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingCcUsers(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAddCcMember = (id: string) => {
    if (!id) return;
    setCcMemberUserIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  };

  const handleRemoveCcMember = (id: string) => {
    setCcMemberUserIds((prev) => prev.filter((existingId) => existingId !== id));
  };

  const handleFilesChosen = (chosen: FileList | null) => {
    if (!chosen || chosen.length === 0) return;
    const result = addAttachments(attachments, Array.from(chosen));
    setAttachments(result.files);
    setAttachmentErrors(result.errors);
    // Clear the input so choosing the same file again (after removing it) fires a change event.
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleRemoveAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
    setAttachmentErrors([]);
  };

  const handleSubmit = async () => {
    if (!assignedToUserId || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const created = await createInvoiceRequest(
        project.id,
        {
          assignedToUserId,
          ccMemberUserIds,
          invoiceAmountNote: invoiceAmountNote.trim() || null,
          copiesRequired: copiesRequired.trim() || null,
          drawingsAvailable: drawingsAvailable.trim() || null,
          printingDetails: printingDetails.trim() || null,
          address: address.trim() || null,
          notes: notes.trim() || null,
        },
        attachments
      );
      if (attachments.length === 0) {
        showToast({ type: "success", title: "Invoice request sent", message: "The responsible person has been notified." });
      } else {
        // The email (with the files) is sent right AFTER the request is saved, so it is not known to have been delivered yet —
        // never claim "notified" here. The real outcome appears on the Invoice Request status once the email has been handled.
        showToast({
          type: "success",
          title: "Invoice request saved",
          message: `The notification email with ${attachments.length} attachment${attachments.length === 1 ? "" : "s"} is being sent. Its delivery status will appear on this request.`,
        });
      }
      onSubmitted(created);
    } catch (error) {
      showToast({ type: "error", title: "Failed to send invoice request", message: getUserFriendlyErrorMessage(error) });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4" onClick={onClose}>
        <div
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-lg max-h-[85vh] flex flex-col bg-[var(--nu-surface)] rounded-2xl shadow-2xl border border-[var(--nu-border)] overflow-hidden"
        >
          <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-[var(--nu-border)] bg-white dark:bg-slate-900 shrink-0">
            <h2 className="text-[16px] font-bold text-[var(--nu-text)]">Request Invoice</h2>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-[var(--nu-text-muted)] hover:bg-[var(--nu-surface-alt)] hover:text-[var(--nu-text)] transition cursor-pointer"
              aria-label="Close"
            >
              <X size={19} />
            </button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto nu-scrollbar p-5 space-y-4">
            <div className="grid grid-cols-2 gap-3 text-[12.5px] rounded-[var(--nu-radius-md)] border border-[var(--nu-border)] bg-[var(--nu-surface-alt)] p-3">
              <div>
                <span className="text-[var(--nu-text-muted)]">Client Name</span>
                <p className="font-semibold text-[var(--nu-text)]">{project.client}</p>
              </div>
              <div>
                <span className="text-[var(--nu-text-muted)]">Project No.</span>
                <p className="font-semibold text-[var(--nu-text)]">{project.prNo}</p>
              </div>
              <div className="col-span-2">
                <span className="text-[var(--nu-text-muted)]">Project Name</span>
                <p className="font-semibold text-[var(--nu-text)]">{project.projectTitle}</p>
              </div>
              <div>
                <span className="text-[var(--nu-text-muted)]">Client Contact Name</span>
                <p className="font-semibold text-[var(--nu-text)]">{project.eicName || "—"}</p>
              </div>
              <div>
                <span className="text-[var(--nu-text-muted)]">Phone Number</span>
                <p className="font-semibold text-[var(--nu-text)]">{project.contactNumber || "—"}</p>
              </div>
              <div className="col-span-2">
                <span className="text-[var(--nu-text-muted)]">E-mail Id</span>
                <p className="font-semibold text-[var(--nu-text)]">{project.emailId || "—"}</p>
              </div>
            </div>

            <div>
              <FormLabel required>Send Invoice To</FormLabel>
              <Select value={assignedToUserId} onChange={(e) => setAssignedToUserId(e.target.value)} disabled={isLoadingUsers}>
                <option value="">
                  {isLoadingUsers ? "Loading eligible users..." : "Select a responsible person"}
                </option>
                {eligibleUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.fullName}
                  </option>
                ))}
              </Select>
              {!isLoadingUsers && eligibleUsers.length === 0 && (
                <p className="text-[11px] text-amber-600 mt-1.5">
                  No active user currently holds the Raise Invoice permission. Ask an Administrator to grant it first.
                </p>
              )}
            </div>

            <div>
              <FormLabel>CC Members</FormLabel>
              <Select
                value=""
                onChange={(e) => handleAddCcMember(e.target.value)}
                disabled={isLoadingCcUsers}
              >
                <option value="">{isLoadingCcUsers ? "Loading users..." : "Select a PMO user to add"}</option>
                {allActiveUsers
                  .filter((u) => !ccMemberUserIds.includes(u.id))
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.fullName}
                    </option>
                  ))}
              </Select>
              {ccMemberUserIds.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {ccMemberUserIds.map((id) => {
                    const user = allActiveUsers.find((u) => u.id === id);
                    if (!user) return null;
                    return (
                      <span
                        key={id}
                        className="inline-flex items-center gap-1 rounded-full bg-[var(--nu-accent-soft)] text-[var(--nu-accent)] pl-2.5 pr-1.5 py-1 text-[12px] font-medium"
                      >
                        {user.fullName}
                        <button
                          type="button"
                          onClick={() => handleRemoveCcMember(id)}
                          aria-label={`Remove ${user.fullName} from CC`}
                          className="rounded-full p-0.5 hover:bg-black/10 dark:hover:bg-white/10 cursor-pointer"
                        >
                          <X size={11} />
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}
              <p className="text-[11px] text-[var(--nu-text-muted)] mt-1.5">
                info@ifluids.com is always included automatically and cannot be removed.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <FormLabel>Invoice Amount</FormLabel>
                <Input
                  value={invoiceAmountNote}
                  onChange={(e) => setInvoiceAmountNote(e.target.value)}
                  placeholder="e.g. 100% on submission of the Final report"
                />
              </div>
              <div>
                <FormLabel>Number of Copies Required</FormLabel>
                <Input value={copiesRequired} onChange={(e) => setCopiesRequired(e.target.value)} placeholder="e.g. NIL" />
              </div>
              <div className="col-span-2">
                <FormLabel>Reports/Drawings Available on the Server</FormLabel>
                <Input
                  value={drawingsAvailable}
                  onChange={(e) => setDrawingsAvailable(e.target.value)}
                  placeholder="e.g. Yes, Report is available in working folder"
                />
              </div>
              <div>
                <FormLabel>Report Printing Details</FormLabel>
                <Input value={printingDetails} onChange={(e) => setPrintingDetails(e.target.value)} placeholder="e.g. NIL" />
              </div>
              <div>
                <FormLabel>Address</FormLabel>
                <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="e.g. As per work order" />
              </div>
            </div>

            <div>
              <FormLabel>Special Note (optional)</FormLabel>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Any other context the responsible person should know..." />
            </div>

            <div data-testid="request-invoice-attachments">
              <FormLabel>Attachments (optional)</FormLabel>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={ATTACHMENT_ACCEPT}
                className="hidden"
                onChange={(e) => handleFilesChosen(e.target.files)}
                aria-label="Choose attachments"
              />
              <Button
                variant="secondary"
                size="sm"
                icon={<Paperclip size={14} />}
                onClick={() => fileInputRef.current?.click()}
                disabled={isSubmitting || attachments.length >= ATTACHMENT_LIMITS.maxFiles}
              >
                Add files
              </Button>
              <p className="text-[11px] text-[var(--nu-text-muted)] mt-1.5">
                Up to {ATTACHMENT_LIMITS.maxFiles} files, {ATTACHMENT_LIMITS.maxFileBytes / (1024 * 1024)} MB each, {ATTACHMENT_LIMITS.maxTotalBytes / (1024 * 1024)} MB in total ({ALLOWED_ATTACHMENT_LABELS}).
                They are attached to the email sent to the responsible person.
              </p>
              {attachmentErrors.length > 0 && (
                <ul role="alert" className="mt-2 space-y-1 text-[12px] text-red-600 dark:text-red-400">
                  {attachmentErrors.map((message, i) => (
                    <li key={`${i}-${message}`}>{message}</li>
                  ))}
                </ul>
              )}
              {attachments.length > 0 && (
                <ul className="mt-2 space-y-1.5">
                  {attachments.map((file, index) => (
                    <li
                      key={`${file.name}-${file.size}-${file.lastModified}-${index}`}
                      className="flex items-center justify-between gap-2 rounded-[var(--nu-radius-md)] border border-[var(--nu-border)] bg-[var(--nu-surface-alt)] px-3 py-1.5 text-[12.5px]"
                    >
                      <span className="min-w-0 truncate font-medium text-[var(--nu-text)]" title={file.name}>
                        {file.name}
                      </span>
                      <span className="shrink-0 text-[var(--nu-text-muted)]">{formatFileSize(file.size)}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveAttachment(index)}
                        disabled={isSubmitting}
                        aria-label={`Remove ${file.name}`}
                        className="shrink-0 rounded-full p-1 text-[var(--nu-text-muted)] hover:bg-black/10 dark:hover:bg-white/10 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <X size={12} />
                      </button>
                    </li>
                  ))}
                  <li className="text-[11px] text-[var(--nu-text-muted)]">
                    {attachments.length} of {ATTACHMENT_LIMITS.maxFiles} files · {formatFileSize(totalAttachmentBytes(attachments))} of {ATTACHMENT_LIMITS.maxTotalBytes / (1024 * 1024)} MB
                  </li>
                </ul>
              )}
              {emailSizeWarning(attachments) && (
                <p role="status" className="mt-2 text-[11.5px] text-amber-600 dark:text-amber-400">
                  {emailSizeWarning(attachments)}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2.5 px-5 py-4 border-t border-[var(--nu-border)] bg-white dark:bg-slate-900">
            <Button variant="secondary" size="sm" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={<Send size={14} />}
              onClick={handleSubmit}
              disabled={!assignedToUserId || isSubmitting}
            >
              {isSubmitting ? "Sending..." : "Send Request"}
            </Button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
