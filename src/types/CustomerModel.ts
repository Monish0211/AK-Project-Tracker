export interface Customer {
  id: string;
  customerName: string;
  status: "Active" | "Inactive";
  createdAt: string;
}