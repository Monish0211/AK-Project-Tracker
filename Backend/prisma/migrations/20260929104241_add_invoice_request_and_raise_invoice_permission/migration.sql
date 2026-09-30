-- CreateTable
CREATE TABLE "InvoiceRequest" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "projectId" TEXT NOT NULL,
    "requestedByUserId" TEXT NOT NULL,
    "assignedToUserId" TEXT NOT NULL,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Open',
    "fulfilledInvoiceLineId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvoiceRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceRequest_fulfilledInvoiceLineId_key" ON "InvoiceRequest"("fulfilledInvoiceLineId");

-- CreateIndex
CREATE INDEX "InvoiceRequest_projectId_idx" ON "InvoiceRequest"("projectId");

-- CreateIndex
CREATE INDEX "InvoiceRequest_assignedToUserId_idx" ON "InvoiceRequest"("assignedToUserId");

-- CreateIndex
CREATE INDEX "InvoiceRequest_status_idx" ON "InvoiceRequest"("status");

-- AddForeignKey
ALTER TABLE "InvoiceRequest" ADD CONSTRAINT "InvoiceRequest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceRequest" ADD CONSTRAINT "InvoiceRequest_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "PortalUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceRequest" ADD CONSTRAINT "InvoiceRequest_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "PortalUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceRequest" ADD CONSTRAINT "InvoiceRequest_fulfilledInvoiceLineId_fkey" FOREIGN KEY ("fulfilledInvoiceLineId") REFERENCES "InvoiceLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed the new "Raise Invoice" ApprovalType lookup row — idempotent, same
-- upsert-by-name convention as prisma/seed.ts's seedLookupTable(). Safe to
-- re-run: ON CONFLICT DO NOTHING means an environment where seed.ts already
-- created this row (or a re-applied migration) is a no-op.
INSERT INTO "ApprovalType" ("id", "name", "isActive", "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Raise Invoice', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;

-- Conservative default rollout grant: every existing Administrator user gets
-- "Raise Invoice" immediately, matching prisma/seed.ts's own bootstrap-admin
-- convention (Administrator receives every ApprovalType on creation).
-- Deliberately does NOT grant any other role automatically — a Manager
-- grants it per user via Settings > User Management for anyone else who
-- should be able to raise invoices, same as any other approval permission.
INSERT INTO "UserApprovalPermission" ("id", "userId", "approvalTypeId", "createdAt")
SELECT gen_random_uuid(), pu."id", at."id", CURRENT_TIMESTAMP
FROM "PortalUser" pu
JOIN "PortalRole" pr ON pr."id" = pu."roleId" AND pr."name" = 'Administrator'
JOIN "ApprovalType" at ON at."name" = 'Raise Invoice'
ON CONFLICT ("userId", "approvalTypeId") DO NOTHING;
