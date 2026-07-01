import type { QuantityItem } from "../types/QuantityItem";

export function calculateQuantity(items: QuantityItem[]) {

    const totalWOQty =
        items.reduce(
            (sum, item) => sum + item.woQty,
            0
        );

    const totalInvoiceQty =
        items.reduce(
            (sum, item) => sum + item.invoiceQty,
            0
        );

    const totalPendingQty =
        items.reduce(
            (sum, item) => sum + item.pendingQty,
            0
        );

    const pendingAmount =
        items.reduce(
            (sum, item) => sum + item.pendingAmount,
            0
        );

    const pendingInvoicePercentage =
        totalWOQty === 0
            ? 0
            : (totalPendingQty / totalWOQty) * 100;

    return {

        totalWOQty,

        totalInvoiceQty,

        totalPendingQty,

        pendingAmount,

        pendingInvoicePercentage

    };

}