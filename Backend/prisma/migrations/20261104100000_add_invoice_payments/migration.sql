-- Invoice Payment workflow (Nov 2026) — ADDITIVE ONLY.
--
-- Four new tables (payment, receipt, adjustment, audit event). Nothing existing is altered, dropped, backfilled or
-- reseeded: no InvoiceLine / Project / PortalUser column changes, no data rewrite, and no new ApprovalType (recording and
-- reversing a payment reuses the existing "Edit Invoice" approval, per the business decision), so no user is granted
-- anything by this migration.
--
-- Money is exact DECIMAL(18,3): 3 decimals covers OMR; INR/USD/AED/... are validated to 2 decimals by the service.
-- Rolling back is code-only: the tables are unused by anything but the new endpoints, so leaving them in place is harmless.

-- CreateTable
CREATE TABLE "InvoicePayment" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "projectId" TEXT NOT NULL,
    "invoiceNo" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "gstApplicable" BOOLEAN NOT NULL,
    "gstRatePercent" DECIMAL(12,6),
    "gstAmount" DECIMAL(18,3),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "idempotencyKey" TEXT NOT NULL,
    "statusTransition" JSONB,
    "recordedByUserId" TEXT,
    "recordedByName" TEXT NOT NULL,
    "recordedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT clock_timestamp(),
    "reversedAt" TIMESTAMPTZ(3),
    "reversedByUserId" TEXT,
    "reversedByName" TEXT,
    "reversalReason" TEXT,

    CONSTRAINT "InvoicePayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoicePaymentReceipt" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "paymentId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "paymentDate" DATE NOT NULL,
    "currency" TEXT NOT NULL,
    "amountReceived" DECIMAL(18,3) NOT NULL,
    "gstReceived" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "reference" TEXT NOT NULL,
    "notes" TEXT,

    CONSTRAINT "InvoicePaymentReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoicePaymentAdjustment" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "paymentId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "amount" DECIMAL(18,3) NOT NULL,
    "reason" TEXT,
    "expectedReleaseDate" DATE,
    "reminderDate" DATE,
    "exchangeRate" DECIMAL(12,6),
    "convertedAmount" DECIMAL(18,3),
    "countsTowardSettlement" BOOLEAN NOT NULL,
    "settlementComponent" TEXT,
    "treatmentNote" TEXT,

    CONSTRAINT "InvoicePaymentAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoicePaymentEvent" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "seq" BIGSERIAL NOT NULL,
    "paymentId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "invoiceNo" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "actorUserId" TEXT,
    "actorName" TEXT NOT NULL,
    "details" JSONB NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT clock_timestamp(),

    CONSTRAINT "InvoicePaymentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InvoicePayment_idempotencyKey_key" ON "InvoicePayment"("idempotencyKey");

-- CreateIndex
CREATE INDEX "InvoicePayment_projectId_invoiceNo_idx" ON "InvoicePayment"("projectId", "invoiceNo");

-- CreateIndex
CREATE INDEX "InvoicePaymentReceipt_paymentId_idx" ON "InvoicePaymentReceipt"("paymentId");

-- CreateIndex
CREATE INDEX "InvoicePaymentAdjustment_paymentId_idx" ON "InvoicePaymentAdjustment"("paymentId");

-- CreateIndex
CREATE INDEX "InvoicePaymentEvent_paymentId_occurredAt_idx" ON "InvoicePaymentEvent"("paymentId", "occurredAt");

-- CreateIndex
CREATE INDEX "InvoicePaymentEvent_projectId_invoiceNo_occurredAt_idx" ON "InvoicePaymentEvent"("projectId", "invoiceNo", "occurredAt");

-- AddForeignKey
ALTER TABLE "InvoicePayment" ADD CONSTRAINT "InvoicePayment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoicePayment" ADD CONSTRAINT "InvoicePayment_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "PortalUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoicePayment" ADD CONSTRAINT "InvoicePayment_reversedByUserId_fkey" FOREIGN KEY ("reversedByUserId") REFERENCES "PortalUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoicePaymentReceipt" ADD CONSTRAINT "InvoicePaymentReceipt_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "InvoicePayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoicePaymentAdjustment" ADD CONSTRAINT "InvoicePaymentAdjustment_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "InvoicePayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoicePaymentEvent" ADD CONSTRAINT "InvoicePaymentEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "PortalUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Integrity rules the application also enforces, repeated here so no other writer can break them.
ALTER TABLE "InvoicePayment" ADD CONSTRAINT "InvoicePayment_status_check" CHECK ("status" IN ('ACTIVE', 'REVERSED'));
ALTER TABLE "InvoicePayment" ADD CONSTRAINT "InvoicePayment_reversal_check" CHECK (("status" = 'REVERSED') = ("reversedAt" IS NOT NULL));
ALTER TABLE "InvoicePayment" ADD CONSTRAINT "InvoicePayment_gst_check" CHECK (("gstApplicable" = true) OR ("gstAmount" IS NULL AND "gstRatePercent" IS NULL));
ALTER TABLE "InvoicePayment" ADD CONSTRAINT "InvoicePayment_gstAmount_check" CHECK ("gstAmount" IS NULL OR "gstAmount" >= 0);
ALTER TABLE "InvoicePaymentReceipt" ADD CONSTRAINT "InvoicePaymentReceipt_amounts_check" CHECK ("amountReceived" >= 0 AND "gstReceived" >= 0);
ALTER TABLE "InvoicePaymentAdjustment" ADD CONSTRAINT "InvoicePaymentAdjustment_amount_check" CHECK ("amount" > 0);
ALTER TABLE "InvoicePaymentAdjustment" ADD CONSTRAINT "InvoicePaymentAdjustment_category_check" CHECK ("category" IN ('TDS', 'GST_TDS', 'SECURITY_DEPOSIT', 'ISD', 'OTHER_DEDUCTIONS', 'LD_AMOUNT', 'BANK_CHARGES', 'WITHHOLDING_TAXES', 'FX_LOSS', 'WAIVE_OFF'));
