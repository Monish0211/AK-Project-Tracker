-- CreateTable
CREATE TABLE "InvoiceNumber" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "invoiceNo" TEXT NOT NULL,
    "normalizedInvoiceNo" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceNumber_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceNumber_normalizedInvoiceNo_key" ON "InvoiceNumber"("normalizedInvoiceNo");

-- CreateIndex
CREATE INDEX "InvoiceNumber_projectId_idx" ON "InvoiceNumber"("projectId");

-- AddForeignKey
ALTER TABLE "InvoiceNumber" ADD CONSTRAINT "InvoiceNumber_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- DataMigration: register every invoice number already in use (any status,
-- Cancelled included), once per number, under the project that uses it.
-- Normalization MUST match invoice.service.ts's normalizeInvoiceNo():
-- outer whitespace trimmed, upper-cased. Historical InvoiceLine.invoiceNo
-- values are never modified. If one number is already used by more than
-- one project, the confirmed portal-wide uniqueness rule cannot be applied
-- automatically — abort and list them for a human decision.
DO $$
DECLARE
  conflicts text;
BEGIN
  SELECT string_agg(k, ', ') INTO conflicts FROM (
    SELECT upper(btrim(l."invoiceNo", E' \t\r\n')) AS k
    FROM "InvoiceLine" l
    JOIN "QuantityItem" q ON q."id" = l."quantityItemId"
    GROUP BY 1
    HAVING COUNT(DISTINCT q."projectId") > 1
    ORDER BY 1
    LIMIT 50
  ) t;
  IF conflicts IS NOT NULL THEN
    RAISE EXCEPTION 'Invoice numbers used by more than one project (resolve before migrating): %', conflicts;
  END IF;
END $$;

INSERT INTO "InvoiceNumber" ("invoiceNo", "normalizedInvoiceNo", "projectId")
SELECT DISTINCT ON (upper(btrim(l."invoiceNo", E' \t\r\n')))
  btrim(l."invoiceNo", E' \t\r\n'),
  upper(btrim(l."invoiceNo", E' \t\r\n')),
  q."projectId"
FROM "InvoiceLine" l
JOIN "QuantityItem" q ON q."id" = l."quantityItemId"
ORDER BY upper(btrim(l."invoiceNo", E' \t\r\n')), l."createdAt";
