# Administrative Controls

Two administrative rights for exceptional cases, managed in **Settings → Administrative Controls** (Administrators only).

| Right | What it allows |
|---|---|
| **PR Approval Administration** | See every PR Request in every country and status (PR Requests → Administration). Edit, approve or reject a request **at its current stage only**, on behalf of the assigned approver. Reassign the Accounts approver (Accounts stage) or the PMO Manager. Delete a Draft, pending or Rejected request (soft delete; the request and its history are kept). Approved requests are never deleted. |
| **Invoice Administration** | Raise an invoice **without the automatic email** ("Raise invoice without sending email", on Edit Project → Invoices and Invoice Tracker). Delete a Raised or Cancelled invoice with a reason: a full copy is archived first and its invoice number stays reserved. Paid or Partially Paid invoices are never deleted. |

Every action needs a reason. Every action, grant, revoke and refused attempt is recorded: in the PR history ("… on behalf of …"), in the invoice's status history, on the Invoice Request, and in the security audit log.

## Owner (production configuration)

| | |
|---|---|
| Setting | `ADMIN_CONTROLS_OWNER_EMAILS` in the backend `.env` |
| Production owner | **Monish**: `ADMIN_CONTROLS_OWNER_EMAILS=monish.n@ifluids.com` (approved 2026-11-21) |
| Takes effect | After a backend restart |

- The owner must be an **active Administrator**. The owner holds both rights automatically; no grant is needed.
- Only the owner can grant or revoke the rights, and only for **another** active Administrator (for example to cover leave). Nobody can change their own rights.
- Other Administrators see the Administrative Controls page read-only.
- The owner cannot be changed from the application: only the server setting decides it.
- If the setting is empty, nobody holds the rights automatically and any active Administrator may manage the others' rights. Production must have the owner set.

## Other rules introduced with this feature

- **Approval rights in User Management**: only an Administrator can change a user's approval rights, never their own, and every change is audited. The two administrative rights are never granted through User Management.
- **Deleting invoices** (decision D3): a Draft is deleted as before (Delete Invoice right). A Raised / Cancelled invoice needs Invoice Administration and a reason. Paid / Partially Paid: never.
- **Final PR approval by an administrator** (decision D2): the project's country is authorised by the administrator's own country access. The project's owner is still the assigned PMO Manager.

## Database (two additive migrations, applied in this order)

1. `20261127100000_add_administrative_controls`: the two rights (granted to nobody), PR soft-delete fields, "on behalf of" on the PR history, and the append-only `InvoiceLineDeletion` archive (update and delete blocked by triggers).
2. `20261128100000_add_invoice_email_suppression_records`: `InvoiceStatusEvent.details` and the Invoice Request's workflow-email outcomes (`raisedEmail*`, `finalEmail*`: sent / failed / suppressed).

Both only add tables, columns, rows and constraints; existing data is not changed. Rollback notes are in each migration's header.
