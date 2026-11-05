-- =============================================================================
-- PMO Portal - READ-ONLY report: invoices that still need GST reconciliation
-- STATUS: SELECT only. Writes nothing, creates nothing, locks nothing beyond the statement.
--
-- An "invoice" is every InvoiceLine sharing (project, invoice number compared ignoring case and outer spaces).
-- A LEGACY invoice has no InvoiceGstSnapshot row: its GST is unknown, its settlement target is the taxable value,
-- and it keeps that until someone reconciles it. Nothing here backfills anything.
--
-- Columns: invoice_id (the InvoiceNumber register id; NULL if the invoice predates the register), invoice number,
-- project / PR reference, taxable amount (sum of the non-cancelled lines), the project GST flag, line statuses,
-- payment status and totals, and snapshot availability.
--
-- TWO VARIANTS - run exactly one:
--   (A) BEFORE the snapshot migration is applied: no snapshot table exists yet, so every invoice is legacy.
--   (B) AFTER the migration: the same report with the real snapshot lookup; keep the final WHERE to list only the
--       invoices that still need reconciliation, or remove it to see everything.
-- =============================================================================

-- ----------------------------- (A) before the migration -----------------------------
WITH inv AS (
  SELECT q."projectId" AS project_id,
         upper(btrim(l."invoiceNo")) AS norm,
         min(btrim(l."invoiceNo")) AS invoice_no,
         count(*) AS line_count,
         count(*) FILTER (WHERE l.status <> 'Cancelled') AS active_line_count,
         string_agg(DISTINCT l.status, ', ' ORDER BY l.status) AS line_statuses,
         min(l.currency) AS currency,
         sum(coalesce(l."invoiceAmountOriginal", l."invoiceAmountINR")) FILTER (WHERE l.status <> 'Cancelled') AS taxable_amount
  FROM "InvoiceLine" l
  JOIN "QuantityItem" q ON q.id = l."quantityItemId"
  GROUP BY q."projectId", upper(btrim(l."invoiceNo"))
),
pay AS (
  SELECT p."projectId" AS project_id,
         upper(btrim(p."invoiceNo")) AS norm,
         count(*) FILTER (WHERE p.status = 'ACTIVE') AS active_payments,
         count(*) FILTER (WHERE p.status = 'REVERSED') AS reversed_payments,
         coalesce(sum((SELECT sum(r."amountReceived") FROM "InvoicePaymentReceipt" r WHERE r."paymentId" = p.id)) FILTER (WHERE p.status = 'ACTIVE'), 0) AS active_bank_received,
         coalesce(sum((SELECT sum(a.amount) FROM "InvoicePaymentAdjustment" a WHERE a."paymentId" = p.id)) FILTER (WHERE p.status = 'ACTIVE'), 0) AS active_deductions
  FROM "InvoicePayment" p
  GROUP BY p."projectId", upper(btrim(p."invoiceNo"))
)
SELECT n.id AS invoice_id,
       inv.invoice_no,
       pr."prNo" AS project_pr_no,
       inv.taxable_amount,
       inv.currency,
       pr."gstApplicable" AS project_gst_flag,
       inv.line_statuses,
       inv.active_line_count,
       CASE WHEN coalesce(pay.active_payments, 0) > 0 THEN 'ACTIVE payment recorded'
            WHEN coalesce(pay.reversed_payments, 0) > 0 THEN 'only reversed payment(s)'
            ELSE 'no payment record' END AS payment_status,
       coalesce(pay.active_bank_received, 0) AS active_bank_received,
       coalesce(pay.active_deductions, 0) AS active_deductions,
       'NO - legacy (snapshot table not created yet)' AS gst_snapshot
FROM inv
JOIN "Project" pr ON pr.id = inv.project_id AND pr."isDeleted" = false
LEFT JOIN "InvoiceNumber" n ON n."normalizedInvoiceNo" = inv.norm
LEFT JOIN pay ON pay.project_id = inv.project_id AND pay.norm = inv.norm
ORDER BY pr."gstApplicable" DESC, pr."prNo", inv.invoice_no;

-- ----------------------------- (B) after the migration -----------------------------
-- Lists the invoices that still have NO GST snapshot (legacy). Remove the WHERE line to list every invoice.
WITH inv AS (
  SELECT q."projectId" AS project_id,
         upper(btrim(l."invoiceNo")) AS norm,
         min(btrim(l."invoiceNo")) AS invoice_no,
         count(*) AS line_count,
         count(*) FILTER (WHERE l.status <> 'Cancelled') AS active_line_count,
         string_agg(DISTINCT l.status, ', ' ORDER BY l.status) AS line_statuses,
         min(l.currency) AS currency,
         sum(coalesce(l."invoiceAmountOriginal", l."invoiceAmountINR")) FILTER (WHERE l.status <> 'Cancelled') AS taxable_amount
  FROM "InvoiceLine" l
  JOIN "QuantityItem" q ON q.id = l."quantityItemId"
  GROUP BY q."projectId", upper(btrim(l."invoiceNo"))
),
pay AS (
  SELECT p."projectId" AS project_id,
         upper(btrim(p."invoiceNo")) AS norm,
         count(*) FILTER (WHERE p.status = 'ACTIVE') AS active_payments,
         count(*) FILTER (WHERE p.status = 'REVERSED') AS reversed_payments,
         coalesce(sum((SELECT sum(r."amountReceived") FROM "InvoicePaymentReceipt" r WHERE r."paymentId" = p.id)) FILTER (WHERE p.status = 'ACTIVE'), 0) AS active_bank_received,
         coalesce(sum((SELECT sum(a.amount) FROM "InvoicePaymentAdjustment" a WHERE a."paymentId" = p.id)) FILTER (WHERE p.status = 'ACTIVE'), 0) AS active_deductions
  FROM "InvoicePayment" p
  GROUP BY p."projectId", upper(btrim(p."invoiceNo"))
)
SELECT n.id AS invoice_id,
       inv.invoice_no,
       pr."prNo" AS project_pr_no,
       inv.taxable_amount,
       inv.currency,
       pr."gstApplicable" AS project_gst_flag,
       inv.line_statuses,
       inv.active_line_count,
       CASE WHEN coalesce(pay.active_payments, 0) > 0 THEN 'ACTIVE payment recorded'
            WHEN coalesce(pay.reversed_payments, 0) > 0 THEN 'only reversed payment(s)'
            ELSE 'no payment record' END AS payment_status,
       coalesce(pay.active_bank_received, 0) AS active_bank_received,
       coalesce(pay.active_deductions, 0) AS active_deductions,
       CASE WHEN s.id IS NULL THEN 'NO - legacy, needs reconciliation'
            ELSE 'YES - ' || s."gstStatus" || coalesce(' @ ' || s."ratePercent"::text || '%', '') END AS gst_snapshot
FROM inv
JOIN "Project" pr ON pr.id = inv.project_id AND pr."isDeleted" = false
LEFT JOIN "InvoiceNumber" n ON n."normalizedInvoiceNo" = inv.norm
LEFT JOIN "InvoiceGstSnapshot" s ON s."invoiceNumberId" = n.id
LEFT JOIN pay ON pay.project_id = inv.project_id AND pay.norm = inv.norm
WHERE s.id IS NULL
ORDER BY pr."gstApplicable" DESC, pr."prNo", inv.invoice_no;
