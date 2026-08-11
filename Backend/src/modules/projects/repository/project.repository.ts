import type { Prisma } from "../../../../generated/prisma/client.js";
import { prisma } from "../../../shared/utils/prismaClient.js";

/**
 * All Prisma access for Projects lives here — the service layer never
 * imports `prisma` directly. Every read filters isDeleted: false (soft
 * delete only, per the Project model's own doc comment), including the
 * duplicate-prNo check — a soft-deleted project's PR number is free to
 * reuse.
 */

export interface ProjectGeneralInfoData {
  poMonth: string;
  prCategory: string;
  prNo: string;
  client: string;
  department: string;
  domesticForeign: string;
  projectTitle: string;
  workOrderStatus: string;
  projectStartDate: Date;
  projectEndDate?: Date | null;
  projectStatus: string;
  actualCompletionDate?: Date | null;
  completionRemarks?: string | null;
  completedBy?: string | null;
  completedTimestamp?: Date | null;
  workOrderNumber?: string | null;
  workOrderDate?: Date | null;
  eicName?: string | null;
  contactNumber?: string | null;
  emailId?: string | null;
  estimatedDuration?: number | null;
  durationUnit?: string | null;
  contractType: string;
  pmoCoordinator?: string | null;
}

export function createProject(data: ProjectGeneralInfoData) {
  return prisma.project.create({ data });
}

export function findProjectById(id: string) {
  return prisma.project.findFirst({ where: { id, isDeleted: false } });
}

export function findActiveProjectByPrNo(prNo: string) {
  return prisma.project.findFirst({ where: { prNo, isDeleted: false } });
}

export function updateProject(id: string, data: Partial<ProjectGeneralInfoData>) {
  return prisma.project.update({ where: { id }, data });
}

export function softDeleteProject(id: string) {
  return prisma.project.update({
    where: { id },
    data: { isDeleted: true, deletedAt: new Date() },
  });
}

export interface ProjectListFilters {
  search?: string | undefined;
  projectStatus?: string | undefined;
  department?: string | undefined;
  client?: string | undefined;
  prCategory?: string | undefined;
}

function buildWhereClause(filters: ProjectListFilters): Prisma.ProjectWhereInput {
  const where: Prisma.ProjectWhereInput = { isDeleted: false };

  if (filters.projectStatus) where.projectStatus = filters.projectStatus;
  if (filters.department) where.department = filters.department;
  if (filters.client) where.client = filters.client;
  if (filters.prCategory) where.prCategory = filters.prCategory;

  if (filters.search) {
    where.OR = [
      { prNo: { contains: filters.search, mode: "insensitive" } },
      { client: { contains: filters.search, mode: "insensitive" } },
      { projectTitle: { contains: filters.search, mode: "insensitive" } },
    ];
  }

  return where;
}

export async function findProjectsPage(
  filters: ProjectListFilters,
  sortField: string,
  sortDirection: "asc" | "desc",
  page: number,
  pageSize: number
) {
  const where = buildWhereClause(filters);

  const [items, total] = await Promise.all([
    prisma.project.findMany({
      where,
      orderBy: { [sortField]: sortDirection },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.project.count({ where }),
  ]);

  return { items, total };
}
