import { prisma } from "./src/shared/utils/prismaClient.js";

const tagPatterns = [
  "inv-fin-auth-",
  "ms-del-race-p13-",
  "auth-ratelimit-",
  "pr-cat-prefix-",
  "self-role-guard-p001-",
  "ts-own-",
];

console.log("=== Residue check: synthetic test data ===");
for (const p of tagPatterns) {
  const users = await prisma.portalUser.findMany({ where: { email: { contains: p } }, select: { id: true } });
  const projects = await prisma.project.findMany({ where: { prNo: { contains: p } }, select: { id: true } });
  console.log(`"${p}" -> users=${users.length} projects=${projects.length}`);
}

console.log("\n=== Protected data verification ===");
const entryAgg = await prisma.timesheetEntry.aggregate({ _count: true, _sum: { hours: true } });
console.log(`TimesheetEntry: ${entryAgg._count} rows, ${entryAgg._sum.hours} hours`);

const akshara = await prisma.timesheetEntry.findMany({
  where: { employeeNo: "0533", project: { prNo: "PR-7087" } },
  select: { hours: true, startTime: true, endTime: true },
});
const totalHours = akshara.reduce((s, r) => s + r.hours, 0);
const withStart = akshara.filter((r) => r.startTime !== null).length;
const withEnd = akshara.filter((r) => r.endTime !== null).length;
console.log(`Akshara/PR-7087: ${akshara.length} rows, ${totalHours} hours, ${withStart} startTime, ${withEnd} endTime`);

await prisma.$disconnect();
