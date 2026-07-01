import type { Dispatch, SetStateAction } from "react";
import type { Project } from "../../../types/Project";

interface Props {
  project: Project;
  setProject: Dispatch<SetStateAction<Project>>;
}

const InvoiceCard = ({ project, setProject }: Props) => {
  const handleInvoiceChange = (value: string) => {
    const invoiceRaised = value === "" ? 0 : Number(value);

    const invoiceRaisedINR =
      project.currency === "INR"
        ? invoiceRaised
        : invoiceRaised * project.contractExchangeRate;

    const balanceToBeRaised =
      project.workOrderValue - invoiceRaised;

    const balanceToBeRaisedINR =
      project.workOrderValueINR - invoiceRaisedINR;

    const outstanding =
      invoiceRaised - project.paymentReceived;

    const outstandingINR =
      invoiceRaisedINR - project.paymentReceivedINR;

    const paymentStatus =
      outstanding <= 0
        ? "Paid"
        : project.paymentReceived === 0
        ? "Not Paid"
        : "Partially Paid";

    setProject({
      ...project,
      invoiceRaised,
      invoiceRaisedINR,
      balanceToBeRaised,
      balanceToBeRaisedINR,
      outstanding,
      outstandingINR,
      paymentStatus,
    });
  };

  const handlePaymentChange = (value: string) => {
    const paymentReceived =
      value === "" ? 0 : Number(value);

    const paymentReceivedINR =
      project.currency === "INR"
        ? paymentReceived
        : paymentReceived *
          project.contractExchangeRate;

    const outstanding =
      project.invoiceRaised - paymentReceived;

    const outstandingINR =
      project.invoiceRaisedINR - paymentReceivedINR;

    const paymentStatus =
      outstanding <= 0
        ? "Paid"
        : paymentReceived === 0
        ? "Not Paid"
        : "Partially Paid";

    setProject({
      ...project,
      paymentReceived,
      paymentReceivedINR,
      outstanding,
      outstandingINR,
      paymentStatus,
    });
  };

  return (
    <div className="bg-white rounded-xl shadow-md p-6">

      <h2 className="text-2xl font-semibold mb-6">
        Invoice Information
      </h2>

      <div className="grid grid-cols-2 gap-6">

        {/* Invoice Raised */}

        <div>
          <label className="block text-sm font-medium mb-2">
            Invoice Raised
          </label>

          <input
            type="number"
            placeholder="Enter Invoice Amount"
            value={
              project.invoiceRaised === 0
                ? ""
                : project.invoiceRaised
            }
            onChange={(e) =>
              handleInvoiceChange(e.target.value)
            }
            className="w-full border rounded-lg p-3"
          />
        </div>

        {/* Payment Received */}

        <div>
          <label className="block text-sm font-medium mb-2">
            Payment Received
          </label>

          <input
            type="number"
            placeholder="Enter Payment Received"
            value={
              project.paymentReceived === 0
                ? ""
                : project.paymentReceived
            }
            onChange={(e) =>
              handlePaymentChange(e.target.value)
            }
            className="w-full border rounded-lg p-3"
          />
        </div>

        {/* Invoice Raised INR */}

        <div>
          <label className="block text-sm font-medium mb-2">
            Invoice Raised (INR)
          </label>

          <input
            type="text"
            readOnly
            value={project.invoiceRaisedINR.toLocaleString("en-IN", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
            className="w-full border rounded-lg p-3 bg-gray-100 font-semibold text-green-700"
          />
        </div>

        {/* Payment Received INR */}

        <div>
          <label className="block text-sm font-medium mb-2">
            Payment Received (INR)
          </label>

          <input
            type="text"
            readOnly
            value={project.paymentReceivedINR.toLocaleString("en-IN", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
            className="w-full border rounded-lg p-3 bg-gray-100 font-semibold text-green-700"
          />
        </div>

        {/* Balance To Be Raised */}

        <div>
          <label className="block text-sm font-medium mb-2">
            Balance To Be Raised
          </label>

          <input
            type="text"
            readOnly
            value={project.balanceToBeRaised.toLocaleString("en-IN", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
            className="w-full border rounded-lg p-3 bg-gray-100"
          />
        </div>

        {/* Outstanding */}

        <div>
          <label className="block text-sm font-medium mb-2">
            Outstanding
          </label>

          <input
            type="text"
            readOnly
            value={project.outstanding.toLocaleString("en-IN", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
            className="w-full border rounded-lg p-3 bg-gray-100"
          />
        </div>

        {/* Payment Status */}

        <div>
          <label className="block text-sm font-medium mb-2">
            Payment Status
          </label>

          <input
            type="text"
            readOnly
            value={project.paymentStatus}
            className="w-full border rounded-lg p-3 bg-gray-100 font-semibold"
          />
        </div>

      </div>

    </div>
  );
};

export default InvoiceCard;