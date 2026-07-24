import { useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { Building2 } from "lucide-react";
import "./customer-master-theme.css";

import type { Customer } from "../../types/CustomerModel";
import {
  getCustomers,
  deleteCustomer,
  importCustomersFromFile,
  downloadCustomerTemplate,
  exportCustomers,
} from "../../services/customerService";
import { useLiveRefresh } from "../../hooks/useLiveRefresh";
import { Card, CardHeader } from "../../components/ui/Card";

import CustomerHero from "./components/CustomerHero";
import CustomerToolbar from "./components/CustomerToolbar";
import type { SortKey, StatusFilter } from "./components/CustomerToolbar";
import CustomerTable from "./components/CustomerTable";
import CustomerModal from "./components/CustomerModal";
import ConfirmDeleteDialog from "./components/ConfirmDeleteDialog";
import RecentCustomersPanel from "./components/RecentCustomersPanel";

interface FormModalState {
  mode: "add" | "edit";
  customer?: Customer;
}

const CustomerMaster = () => {
  const { refreshKey } = useLiveRefresh();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All");
  const [sortKey, setSortKey] = useState<SortKey>("newest");

  const [formModal, setFormModal] = useState<FormModalState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null);

  // Re-reads on every refresh tick — own saves and any other tab's saves alike.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const customers = useMemo(() => getCustomers(), [refreshKey]);

  const stats = useMemo(() => {
    const today = new Date().toDateString();
    return {
      total: customers.length,
      active: customers.filter((c) => c.status === "Active").length,
      inactive: customers.filter((c) => c.status === "Inactive").length,
      addedToday: customers.filter((c) => new Date(c.createdAt).toDateString() === today).length,
    };
  }, [customers]);

  const visibleCustomers = useMemo(() => {
    const query = search.trim().toLowerCase();

    let result = customers.filter((c) => {
      if (!query) return true;
      return (
        c.customerName.toLowerCase().includes(query) ||
        (c.companyName || "").toLowerCase().includes(query) ||
        (c.customerId || "").toLowerCase().includes(query)
      );
    });

    if (statusFilter !== "All") {
      result = result.filter((c) => c.status === statusFilter);
    }

    result = [...result].sort((a, b) => {
      switch (sortKey) {
        case "name-asc":
          return a.customerName.localeCompare(b.customerName);
        case "name-desc":
          return b.customerName.localeCompare(a.customerName);
        case "oldest":
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case "newest":
        default:
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
    });

    return result;
  }, [customers, search, statusFilter, sortKey]);

  const handleReset = () => {
    setSearch("");
    setStatusFilter("All");
    setSortKey("newest");
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    try {
      const result = await importCustomersFromFile(file);

      if (result.errors.length > 0) {
        alert(
          `Import aborted. Fix the following validation issues:\n\n${result.errors
            .slice(0, 10)
            .join("\n")}${result.errors.length > 10 ? `\n...and ${result.errors.length - 10} more` : ""}`
        );
        return;
      }

      alert(`Imported ${result.imported} customer(s).\nSkipped ${result.skipped} duplicate(s).`);
    } catch {
      alert("Failed to read the file. Please check the file format and try again.");
    }
  };

  const handleDeleteConfirm = () => {
    if (!deleteTarget) return;
    deleteCustomer(deleteTarget.id);
    setDeleteTarget(null);
  };

  return (
    <div className="customer-master-shell -m-6">
      <input ref={fileInputRef} type="file" accept=".xlsx,.csv" className="hidden" onChange={handleFileChange} />

      <div key={refreshKey} className="p-4 space-y-3.5 nu-fade-in">
        <CustomerHero
          total={stats.total}
          active={stats.active}
          inactive={stats.inactive}
          addedToday={stats.addedToday}
          onAddCustomer={() => setFormModal({ mode: "add" })}
        />

        <div className="grid grid-cols-1 xl:grid-cols-4 gap-3.5 items-stretch">
          <div className="xl:col-span-3 flex flex-col h-full">
            <Card padded={false} elevated className="flex-1 flex flex-col h-full">
              <CardHeader
                icon={<Building2 size={15} />}
                title="Customer Repository"
                subtitle="Search, manage and maintain customer organizations."
              />
              <CustomerToolbar
                search={search}
                onSearchChange={setSearch}
                statusFilter={statusFilter}
                onStatusFilterChange={setStatusFilter}
                sortKey={sortKey}
                onSortChange={setSortKey}
                onUploadClick={() => fileInputRef.current?.click()}
                onDownloadTemplate={downloadCustomerTemplate}
                onExport={(format) => exportCustomers(visibleCustomers, format)}
                onReset={handleReset}
                onAddCustomer={() => setFormModal({ mode: "add" })}
              />
              <CustomerTable
                customers={visibleCustomers}
                onEdit={(customer) => setFormModal({ mode: "edit", customer })}
                onDelete={(customer) => setDeleteTarget(customer)}
              />
            </Card>
          </div>

          <RecentCustomersPanel customers={customers} />
        </div>
      </div>

      {formModal && (
        <CustomerModal mode={formModal.mode} customer={formModal.customer} onClose={() => setFormModal(null)} />
      )}

      {deleteTarget && (
        <ConfirmDeleteDialog
          customerName={deleteTarget.customerName}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={handleDeleteConfirm}
        />
      )}
    </div>
  );
};

export default CustomerMaster;
