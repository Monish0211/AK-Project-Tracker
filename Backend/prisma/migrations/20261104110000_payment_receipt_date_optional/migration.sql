-- Invoice Payment workflow (Nov 2026): no field of the payment popup is mandatory, so the receipt's payment date is optional.
-- ADDITIVE / relaxing only: drops a NOT NULL on the new, still-empty-in-production InvoicePaymentReceipt table. No data is touched.
ALTER TABLE "InvoicePaymentReceipt" ALTER COLUMN "paymentDate" DROP NOT NULL;
