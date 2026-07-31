import type { Project } from "../types/Project";

export interface NextPaymentInfo {
  paymentPercentage: number;
  dueDate: string;
  amount: number;
  daysLeft: number;
  status: "Upcoming" | "Today" | "Overdue";
}

export function getNextPayment(
  project: Project
): NextPaymentInfo | null {
  const milestones = project.paymentMilestones ?? [];

  if (milestones.length === 0) return null;

  const validMilestones = milestones
    .filter((m) => m.dueDate)
    .sort(
      (a, b) =>
        new Date(a.dueDate).getTime() -
        new Date(b.dueDate).getTime()
    );

  if (validMilestones.length === 0) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // First upcoming payment
  const upcoming = validMilestones.find((m) => {
    const due = new Date(m.dueDate);
    due.setHours(0, 0, 0, 0);
    return due >= today;
  });

  const milestone =
    upcoming ?? validMilestones[validMilestones.length - 1];

  const due = new Date(milestone.dueDate);
  due.setHours(0, 0, 0, 0);

  const diff =
    Math.floor(
      (due.getTime() - today.getTime()) /
        (1000 * 60 * 60 * 24)
    );

  let status: "Upcoming" | "Today" | "Overdue";

  if (diff > 0) {
    status = "Upcoming";
  } else if (diff === 0) {
    status = "Today";
  } else {
    status = "Overdue";
  }

  return {
    paymentPercentage: milestone.paymentPercentage,
    dueDate: milestone.dueDate,
    amount: milestone.amount,
    daysLeft: diff,
    status,
  };
}