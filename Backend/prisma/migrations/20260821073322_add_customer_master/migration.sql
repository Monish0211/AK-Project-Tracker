-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "customerCode" TEXT,
    "customerName" TEXT NOT NULL,
    "companyName" TEXT,
    "country" TEXT,
    "contactPerson" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Customer_status_idx" ON "Customer"("status");

-- CreateIndex
CREATE INDEX "Customer_customerCode_idx" ON "Customer"("customerCode");

-- CreateIndex
CREATE INDEX "Customer_customerName_idx" ON "Customer"("customerName");

-- Case-insensitive uniqueness for customerName — matches the existing
-- frontend rule (customerService.ts rejects duplicate names ignoring case).
-- Prisma @@unique is case-sensitive on Postgres, so this is expressed in SQL.
CREATE UNIQUE INDEX "Customer_customerName_lower_key" ON "Customer" (lower("customerName"));
