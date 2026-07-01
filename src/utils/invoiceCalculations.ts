import type { Project } from "../types/Project";

export function calculateInvoice(project: Project) {

    const invoiceRaisedINR =
        project.invoiceRaised *
        project.contractExchangeRate;

    const balanceToBeRaised =
        project.workOrderValue -
        project.invoiceRaised;

    const balanceToBeRaisedINR =
        balanceToBeRaised *
        project.contractExchangeRate;

    const paymentReceivedINR =
        project.paymentReceived *
        project.contractExchangeRate;

    const outstanding =
        project.invoiceRaised -
        project.paymentReceived;

    const outstandingINR =
        outstanding *
        project.contractExchangeRate;

    let paymentStatus = "Not Invoiced";

    if (project.invoiceRaised > 0)
        paymentStatus = "Partial Payment";

    if (outstanding === 0 && project.invoiceRaised > 0)
        paymentStatus = "Paid";

    if (
        project.invoiceRaised ===
        project.workOrderValue
    )
        paymentStatus = "Fully Invoiced";

    return {

        invoiceRaisedINR,

        balanceToBeRaised,

        balanceToBeRaisedINR,

        paymentReceivedINR,

        outstanding,

        outstandingINR,

        paymentStatus

    };

}