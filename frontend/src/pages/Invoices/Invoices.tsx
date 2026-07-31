import "./invoices-theme.css";
import InvoiceHeader from "./components/InvoiceHeader";
import InvoiceKPIs from "./components/InvoiceKPIs";
import InvoiceTable from "./components/InvoiceTable";

const Invoices = () => {
  return (
    <div className="invoices-workspace space-y-6">

      <InvoiceHeader />

      <InvoiceKPIs />

      <InvoiceTable />

    </div>
  );
};

export default Invoices;