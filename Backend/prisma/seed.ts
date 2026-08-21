import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import {
  APPROVAL_TYPES,
  MODULES,
  PORTAL_ROLES,
  REGIONS,
} from "../src/shared/constants/permissions.constants.js";
import { addDays } from "../src/shared/utils/date.util.js";
import { env } from "../src/shared/utils/env.js";
import { hashPassword } from "../src/shared/utils/password.util.js";
import { prisma } from "../src/shared/utils/prismaClient.js";

const BOOTSTRAP_ADMIN_EMAIL = process.env["ADMIN_BOOTSTRAP_EMAIL"] ?? "admin@ifluids.com";
const BOOTSTRAP_ADMIN_PASSWORD = process.env["ADMIN_BOOTSTRAP_PASSWORD"] ?? "ChangeMe@123";

async function seedLookupTable<T extends string>(
  label: string,
  names: readonly T[],
  upsert: (name: T) => Promise<unknown>
) {
  for (const name of names) {
    await upsert(name);
  }
  console.log(`Seeded ${names.length} ${label}.`);
}

/**
 * Deterministic Customer Master seed from the extracted frontend name list
 * (prisma/customerMasterSeedNames.json). Only populates customerName +
 * status=Active — never fabricates company/contact/email. Skips names that
 * already exist (case-insensitive) so re-running seed is safe and never
 * overwrites edits.
 */
async function seedCustomersFromBuiltInList() {
  const here = dirname(fileURLToPath(import.meta.url));
  const raw = readFileSync(join(here, "customerMasterSeedNames.json"), "utf8");
  const names = JSON.parse(raw) as string[];

  let created = 0;
  let skipped = 0;

  for (const customerName of names) {
    const trimmed = customerName.trim();
    if (!trimmed) {
      skipped += 1;
      continue;
    }

    const existing = await prisma.customer.findFirst({
      where: { customerName: { equals: trimmed, mode: "insensitive" } },
    });

    if (existing) {
      skipped += 1;
      continue;
    }

    await prisma.customer.create({
      data: { customerName: trimmed, status: "Active" },
    });
    created += 1;
  }

  console.log(`Customer Master seed: created ${created}, skipped ${skipped} (of ${names.length} names).`);
}

async function main() {
  await seedLookupTable("roles", PORTAL_ROLES, (name) =>
    prisma.portalRole.upsert({ where: { name }, update: {}, create: { name } })
  );

  await seedLookupTable("modules", MODULES, (name) =>
    prisma.module.upsert({ where: { name }, update: {}, create: { name } })
  );

  await seedLookupTable("regions", REGIONS, (name) =>
    prisma.region.upsert({ where: { name }, update: {}, create: { name } })
  );

  await seedLookupTable("approval types", APPROVAL_TYPES, (name) =>
    prisma.approvalType.upsert({ where: { name }, update: {}, create: { name } })
  );

  const administratorRole = await prisma.portalRole.findUniqueOrThrow({
    where: { name: "Administrator" },
  });

  const allModules = await prisma.module.findMany();
  const allRegions = await prisma.region.findMany();
  const allApprovalTypes = await prisma.approvalType.findMany();

  const passwordHash = await hashPassword(BOOTSTRAP_ADMIN_PASSWORD);

  const admin = await prisma.portalUser.upsert({
    where: { email: BOOTSTRAP_ADMIN_EMAIL },
    update: {},
    create: {
      fullName: "System Administrator",
      email: BOOTSTRAP_ADMIN_EMAIL,
      passwordHash,
      department: "PMO",
      designation: "Administrator",
      employeeType: "Portal User",
      roleId: administratorRole.id,
      forcePasswordChange: true,
      passwordExpiresAt: addDays(new Date(), env.PASSWORD_EXPIRY_DAYS),
      moduleAccess: {
        create: allModules.map((module) => ({ moduleId: module.id })),
      },
      regionAccess: {
        create: allRegions.map((region) => ({ regionId: region.id })),
      },
      approvalPermissions: {
        create: allApprovalTypes.map((approvalType) => ({ approvalTypeId: approvalType.id })),
      },
    },
  });

  console.log(`Bootstrap Administrator ready: ${admin.email}`);
  console.log(
    `Bootstrap password: ${BOOTSTRAP_ADMIN_PASSWORD} (forcePasswordChange is ON — change it on first login).`
  );

  await seedCustomersFromBuiltInList();
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
