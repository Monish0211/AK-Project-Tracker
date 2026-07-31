import type { Tone } from "./Badge";

export const statusTone = (status: string): Tone => {
  switch (status) {
    case "Active":
      return "accent";
    case "Completed":
      return "success";
    case "On Hold":
      return "warning";
    case "Cancelled":
      return "danger";
    default:
      return "neutral";
  }
};
