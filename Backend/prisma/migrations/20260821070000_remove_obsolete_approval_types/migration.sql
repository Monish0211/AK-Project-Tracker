-- Data cleanup: the PMO Portal has no separate approval workflow for
-- Timesheets/Expenses/Invoices/Customers/Budget Changes/Project Creation/
-- Reminders — these seven ApprovalType rows (and any UserApprovalPermission
-- grant referencing them, via the existing onDelete: Cascade FK) are removed.
-- "Archive Projects" and "Delete Project Permanently" are NOT touched.
DELETE FROM "ApprovalType" WHERE "name" IN (
  'Approve Timesheets',
  'Approve Expenses',
  'Approve Invoices',
  'Approve Customers',
  'Approve Budget Changes',
  'Approve Project Creation',
  'Approve Reminders'
);
