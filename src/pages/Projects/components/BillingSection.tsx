import type { Project } from "../../../types/Project";
import InfoField from "./InfoField";
import InfoSection from "./InfoSection";

interface Props {
  project: Project;
}

const BillingSection = ({ project }: Props) => {
  return (
    <InfoSection title="Invoice Information">
      <InfoField
        label="Invoice Raised"
        value={project.invoiceRaised.toLocaleString("en-IN")}
      />

      <InfoField
        label="Invoice Raised (INR)"
        value={`₹ ${project.invoiceRaisedINR.toLocaleString("en-IN", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`}
      />

      <InfoField
        label="Balance To Be Raised"
        value={project.balanceToBeRaised.toLocaleString("en-IN")}
      />

      <InfoField
        label="Balance To Be Raised (INR)"
        value={`₹ ${project.balanceToBeRaisedINR.toLocaleString("en-IN", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`}
      />

      <InfoField
        label="Payment Received"
        value={project.paymentReceived.toLocaleString("en-IN")}
      />

      <InfoField
        label="Payment Received (INR)"
        value={`₹ ${project.paymentReceivedINR.toLocaleString("en-IN", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`}
      />

      <InfoField
        label="Outstanding"
        value={project.outstanding.toLocaleString("en-IN")}
      />

      <InfoField
        label="Outstanding (INR)"
        value={`₹ ${project.outstandingINR.toLocaleString("en-IN", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`}
      />

      <InfoField
        label="Payment Status"
        value={project.paymentStatus}
      />
    </InfoSection>
  );
};

export default BillingSection;