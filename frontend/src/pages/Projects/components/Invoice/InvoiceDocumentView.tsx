import type { InvoiceDocumentDTO, InvoiceDocumentLineItem } from "../../../../types/InvoiceDocument";
import { formatFullINR } from "../../../../utils/formatCurrency";
import { formatIndianNumber } from "../../../../utils/quantityCalculations";

interface Props {
  document: InvoiceDocumentDTO;
}

export function InvoiceDocumentView({ document }: Props) {
  const d = document;
  const isLumpSumDocument = d.billingMethod === "lump_sum";
  const isMlmpDocument = d.billingMethod === "mlmp";
  const isAmountBasedDocument = d.billingMethod === "amount_based";
  // Lump Sum and MLMP both show Milestone % instead of the Quantity table's
  // HSN/SAC, GST %, Basic Unit Rate, UOM, Quantity columns — there is no
  // quantity in either milestone-based billing method. MLMP additionally
  // gets its own SET column. Amount Based has neither a milestone % NOR any
  // qty/rate concept — just Particulars + Amount.
  const isMilestoneDocument = isLumpSumDocument || isMlmpDocument;
  // How many leading columns (SI No. + Particulars + whatever comes before
  // Amount) the GST Output/Total rows must colSpan across — Lump Sum's line
  // table only ever has 3 (SI, Particulars, Milestone %), MLMP has 4 (+SET),
  // Amount Based has 2 (SI, Particulars only), never the Quantity table's
  // 5/7, regardless of GST applicability.
  const leadingColumnCount = isLumpSumDocument
    ? 3
    : isMlmpDocument
    ? 4
    : isAmountBasedDocument
    ? 2
    : d.isGstApplicable
    ? 7
    : 5;

  return (
    <div className="invoice-document-root bg-white text-black p-4 sm:p-5 font-sans max-w-4xl mx-auto border border-gray-300 shadow-lg print:shadow-none print:border-none print:p-0 print:m-0 print:max-w-none print:w-full">
      {/* Tax Invoice Header Title */}
      <div className="text-center font-bold text-base uppercase tracking-wide border-b border-black pb-0.5 mb-1.5">
        Tax Invoice
      </div>

      {/* Top Grid Container: Company & Buyer + Invoice Details.
          Unconditional grid-cols-2 (never a `md:` responsive prefix) — this
          is a fixed-width A4 print document, not a responsive on-screen
          layout. The printed page's content-box width (A4 210mm minus the
          5mm/6mm @page margins, ≈198mm ≈ 748px) sits BELOW Tailwind's
          default `md` breakpoint (768px), so any `md:` utility class here
          silently never applies at print time — the on-screen Preview
          modal is wide enough to satisfy it, but the printed/PDF output
          isn't, which is exactly what collapsed this into one stacked
          column with the invoice-reference box shifted below instead of
          beside it. Never gate this document's structural layout behind a
          responsive breakpoint. */}
      <div className="border border-black grid grid-cols-2 text-[10.5px] leading-tight">
        {/* Left Column: Company Details & Logo */}
        <div className="border-r border-black p-2 space-y-0.5">
          <div className="flex items-center gap-2 mb-1">
            <div className="flex items-center">
              <span className="text-lg font-extrabold text-blue-900 tracking-tighter">iFluids</span>
              <span className="text-[9px] font-bold text-red-600 uppercase tracking-widest ml-1">ENGINEERING</span>
            </div>
          </div>

          <p className="font-bold text-xs">{d.companyName}</p>
          <p className="whitespace-pre-line text-gray-800 text-[10px] leading-snug">{d.companyAddress}</p>
          <p className="font-semibold pt-0.5">GSTIN/UIN: <span className="font-mono">{d.companyGstin}</span></p>
          <p>State Name : {d.companyState}, Code : {d.companyStateCode}</p>
          <p>E-Mail : {d.companyEmail}</p>

          {/* Buyer Details */}
          <div className="pt-2 border-t border-black mt-2">
            <p className="font-bold uppercase tracking-wider text-gray-700 text-[9.5px]">Buyer (Bill to)</p>
            <p className="font-extrabold text-xs text-black">{d.buyerName}</p>
            <p className="text-gray-800 whitespace-pre-line leading-snug text-[10px]">{d.buyerAddress}</p>
            <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 pt-1 text-[10px]">
              <p><span className="font-semibold">GSTIN/UIN:</span> <span className="font-mono font-bold">{d.buyerGstin}</span></p>
              <p><span className="font-semibold">State Name:</span> {d.buyerState}, Code: {d.buyerStateCode}</p>
              <p><span className="font-semibold">Place of Supply:</span> {d.buyerPlaceOfSupply}</p>
              <p><span className="font-semibold">Contact person:</span> {d.buyerContactPerson}</p>
              <p><span className="font-semibold">Contact:</span> {d.buyerContactPhone}</p>
              <p><span className="font-semibold">E-Mail:</span> {d.buyerContactEmail}</p>
            </div>
          </div>
        </div>

        {/* Right Column: Invoice & Order References Table */}
        <div className="text-[10.5px]">
          <div className="grid grid-cols-2 border-b border-black">
            <div className="p-1.5 border-r border-black">
              <span className="text-[9.5px] text-gray-600 block">Invoice No.</span>
              <span className="font-extrabold text-xs font-mono">{d.invoiceNoCustom}</span>
            </div>
            <div className="p-1.5">
              <span className="text-[9.5px] text-gray-600 block">Dated</span>
              <span className="font-bold font-mono">{d.invoiceDate}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 border-b border-black">
            <div className="p-1.5 border-r border-black">
              <span className="text-[9.5px] text-gray-600 block">Reference No. & Date.</span>
              <span className="font-medium">{d.referenceNoAndDate}</span>
            </div>
            <div className="p-1.5">
              <span className="text-[9.5px] text-gray-600 block">Mode/Terms of Payment</span>
              <span className="font-bold">{d.paymentTerms}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 border-b border-black">
            <div className="p-1.5 border-r border-black">
              <span className="text-[9.5px] text-gray-600 block">Buyer's Order No.</span>
              <span className="font-bold font-mono">{d.buyersOrderNo}</span>
            </div>
            <div className="p-1.5">
              <span className="text-[9.5px] text-gray-600 block">Other References</span>
              <span className="font-medium">{d.otherReferences}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 border-b border-black">
            <div className="p-1.5 border-r border-black">
              <span className="text-[9.5px] text-gray-600 block">Dated</span>
              <span className="font-medium font-mono">{d.buyersOrderDate}</span>
            </div>
            <div className="p-1.5">
              <span className="text-[9.5px] text-gray-600 block">Dated</span>
              <span className="font-medium font-mono">{d.referenceDate || "—"}</span>
            </div>
          </div>

          <div className="p-1.5 h-full">
            <span className="text-[9.5px] text-gray-600 block">Terms of Delivery</span>
            <span className="font-medium whitespace-pre-line leading-tight">{d.termsOfDelivery}</span>
          </div>
        </div>
      </div>

      {/* Line Items Table — two entirely independent column layouts. Lump
          Sum never shows HSN/SAC, GST %, Basic Unit Rate, UOM, or Quantity
          (there is no quantity in milestone billing); it shows Milestone %
          instead. Which layout renders is decided once by d.billingMethod,
          never inferred per-row. */}
      <div className="border-x border-b border-black overflow-x-auto">
        <table className="w-full border-collapse text-[10.5px] text-left">
          <thead>
            <tr className="border-b border-black bg-gray-50 text-center font-bold text-[10px]">
              <th className="border-r border-black p-1 w-7">SI No.</th>
              <th className="border-r border-black p-1 text-left min-w-[180px]">Particulars</th>
              {isMlmpDocument && <th className="border-r border-black p-1 w-16">SET</th>}
              {!isAmountBasedDocument && (
                isMilestoneDocument ? (
                  <th className="border-r border-black p-1 w-16">Milestone %</th>
                ) : (
                  <>
                    {d.isGstApplicable && <th className="border-r border-black p-1 w-14">HSN/SAC</th>}
                    {d.isGstApplicable && <th className="border-r border-black p-1 w-12">GST %</th>}
                    <th className="border-r border-black p-1 text-right w-24">Basic Unit Rate in INR</th>
                    <th className="border-r border-black p-1 w-14">UOM</th>
                    <th className="border-r border-black p-1 text-center w-16">Quantity</th>
                  </>
                )
              )}
              <th className="p-1 text-right w-24">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {d.lineItems.map((item: InvoiceDocumentLineItem) => (
              <tr key={item.slNo} className="align-top">
                <td className="border-r border-black p-1.5 text-center font-semibold">{item.slNo}</td>
                <td className="border-r border-black p-1.5">
                  <p className="font-bold text-black">{item.activityName}</p>
                  {item.descriptionNotes && (
                    <p className="text-[9.5px] text-gray-600 italic mt-0.5">{item.descriptionNotes}</p>
                  )}
                </td>
                {isMlmpDocument && (
                  <td className="border-r border-black p-1.5 text-center font-semibold whitespace-nowrap">{item.setLabel}</td>
                )}
                {!isAmountBasedDocument && (
                  isMilestoneDocument ? (
                    <td className="border-r border-black p-1.5 text-center font-semibold">{item.milestonePercent}%</td>
                  ) : (
                    <>
                      {d.isGstApplicable && <td className="border-r border-black p-1.5 text-center font-mono">{item.hsnSac}</td>}
                      {d.isGstApplicable && <td className="border-r border-black p-1.5 text-center">{item.gstRatePercent}%</td>}
                      <td className="border-r border-black p-1.5 text-right font-mono">{formatFullINR(item.basicUnitRateINR ?? 0)}</td>
                      <td className="border-r border-black p-1.5 text-center">{item.uom}</td>
                      <td className="border-r border-black p-1.5 text-center font-semibold">{formatIndianNumber(item.quantity ?? 0)}</td>
                    </>
                  )
                )}
                <td className="p-1.5 text-right font-bold font-mono">{formatFullINR(item.amountINR)}</td>
              </tr>
            ))}

            {/* GST Output Rows */}
            {d.isGstApplicable && d.isInterState && (
              <tr>
                <td colSpan={leadingColumnCount} className="border-r border-black p-1.5 text-right font-bold italic">
                  Output IGST
                </td>
                <td className="p-1.5 text-right font-bold font-mono">{formatFullINR(d.igstAmountINR)}</td>
              </tr>
            )}

            {d.isGstApplicable && !d.isInterState && (
              <>
                <tr>
                  <td colSpan={leadingColumnCount} className="border-r border-black p-1.5 text-right font-bold italic text-[10px]">
                    Output CGST
                  </td>
                  <td className="p-1.5 text-right font-bold font-mono">{formatFullINR(d.cgstAmountINR)}</td>
                </tr>
                <tr>
                  <td colSpan={leadingColumnCount} className="border-r border-black p-1.5 text-right font-bold italic text-[10px]">
                    Output SGST
                  </td>
                  <td className="p-1.5 text-right font-bold font-mono">{formatFullINR(d.sgstAmountINR)}</td>
                </tr>
              </>
            )}

            {/* Total Row */}
            <tr className="border-t border-black bg-gray-100 font-extrabold text-[11px]">
              <td colSpan={leadingColumnCount} className="border-r border-black p-1.5 text-right uppercase">
                Total
              </td>
              <td className="p-1.5 text-right font-mono text-xs">
                ₹ {formatFullINR(d.grandTotalINR)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Amount Chargeable in Words */}
      <div className="border-x border-b border-black p-1.5 px-2 text-[10.5px] flex justify-between items-center">
        <div>
          <span className="text-[9.5px] text-gray-600 block">Amount Chargeable (in words)</span>
          <span className="font-extrabold text-black tracking-tight">{d.amountInWords}</span>
        </div>
        <span className="text-[9.5px] font-bold text-gray-500">E. & O.E</span>
      </div>

      {/* Tax Summary Table (If GST Applicable) */}
      {d.isGstApplicable && (
        <div className="border-x border-b border-black">
          <table className="w-full border-collapse text-[10px] text-center">
            <thead>
              <tr className="border-b border-black bg-gray-50 font-bold">
                <th className="border-r border-black p-1">HSN/SAC</th>
                <th className="border-r border-black p-1 text-right">Taxable Value</th>
                {d.isInterState ? (
                  <>
                    <th className="border-r border-black p-1" colSpan={2}>IGST</th>
                  </>
                ) : (
                  <>
                    <th className="border-r border-black p-1" colSpan={2}>CGST</th>
                    <th className="border-r border-black p-1" colSpan={2}>SGST</th>
                  </>
                )}
                <th className="p-1 text-right">Total Tax Amount</th>
              </tr>
              <tr className="border-b border-black bg-gray-50 font-semibold text-[9px]">
                <th className="border-r border-black p-0.5"></th>
                <th className="border-r border-black p-0.5"></th>
                {d.isInterState ? (
                  <>
                    <th className="border-r border-black p-0.5">Rate</th>
                    <th className="border-r border-black p-0.5">Amount</th>
                  </>
                ) : (
                  <>
                    <th className="border-r border-black p-0.5">Rate</th>
                    <th className="border-r border-black p-0.5">Amount</th>
                    <th className="border-r border-black p-0.5">Rate</th>
                    <th className="border-r border-black p-0.5">Amount</th>
                  </>
                )}
                <th className="p-0.5"></th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border-r border-black p-1 font-mono">998399</td>
                <td className="border-r border-black p-1 text-right font-mono">{formatFullINR(d.subtotalINR)}</td>
                {d.isInterState ? (
                  <>
                    <td className="border-r border-black p-1">{d.taxRatePercent}%</td>
                    <td className="border-r border-black p-1 text-right font-mono">{formatFullINR(d.igstAmountINR)}</td>
                  </>
                ) : (
                  <>
                    <td className="border-r border-black p-1">{d.taxRatePercent / 2}%</td>
                    <td className="border-r border-black p-1 text-right font-mono">{formatFullINR(d.cgstAmountINR)}</td>
                    <td className="border-r border-black p-1">{d.taxRatePercent / 2}%</td>
                    <td className="border-r border-black p-1 text-right font-mono">{formatFullINR(d.sgstAmountINR)}</td>
                  </>
                )}
                <td className="p-1 text-right font-bold font-mono">{formatFullINR(d.totalTaxINR)}</td>
              </tr>
              <tr className="border-t border-black bg-gray-100 font-bold">
                <td className="border-r border-black p-1">Total</td>
                <td className="border-r border-black p-1 text-right font-mono">{formatFullINR(d.subtotalINR)}</td>
                {d.isInterState ? (
                  <>
                    <td className="border-r border-black p-1"></td>
                    <td className="border-r border-black p-1 text-right font-mono">{formatFullINR(d.igstAmountINR)}</td>
                  </>
                ) : (
                  <>
                    <td className="border-r border-black p-1"></td>
                    <td className="border-r border-black p-1 text-right font-mono">{formatFullINR(d.cgstAmountINR)}</td>
                    <td className="border-r border-black p-1"></td>
                    <td className="border-r border-black p-1 text-right font-mono">{formatFullINR(d.sgstAmountINR)}</td>
                  </>
                )}
                <td className="p-1 text-right font-mono font-extrabold">{formatFullINR(d.totalTaxINR)}</td>
              </tr>
            </tbody>
          </table>

          <div className="p-1.5 border-t border-black text-[10px]">
            <span className="text-gray-600">Tax Amount (in words) : </span>
            <span className="font-extrabold text-black">{d.taxAmountInWords}</span>
          </div>
        </div>
      )}

      {/* Footer Details & Signatures — matches the original invoice template's
          column assignment exactly: LEFT = Company's PAN, then (lower down)
          Customer's Seal and Signature; RIGHT = Company's Bank Details block,
          then (lower down) the company signature line and Authorised
          Signatory. Do not swap these — Bank Details belongs in the RIGHT
          column, not alongside PAN on the left. */}
      <div className="border-x border-b border-black grid grid-cols-2 text-[10.5px] p-2.5 gap-3">
        {/* LEFT column: PAN + Customer's Seal and Signature */}
        <div className="flex flex-col justify-between">
          <p><span className="font-semibold">Company's PAN :</span> <span className="font-mono font-bold">{d.companyPan}</span></p>
          <div className="pt-6">
            <span className="text-[9.5px] text-gray-700 font-semibold">Customer's Seal and Signature</span>
          </div>
        </div>

        {/* RIGHT column: Company's Bank Details + Company Signature / Authorised Signatory */}
        <div className="flex flex-col justify-between">
          <div className="space-y-0.5">
            <p className="font-bold uppercase tracking-wider text-[9.5px] text-gray-700">Company's Bank Details</p>
            <p><span className="font-semibold">Bank Name :</span> {d.bankName}</p>
            <p><span className="font-semibold">A/c No. :</span> <span className="font-mono font-bold">{d.accountNo}</span></p>
            <p><span className="font-semibold">Branch & IFS Code :</span> {d.branchAndIfsc}</p>
          </div>

          <div className="text-right pt-4">
            <p className="font-bold text-[11px] text-black">{d.companySignatureText}</p>
            <div className="pt-6">
              <span className="font-extrabold text-[11px] uppercase border-t border-black inline-block pt-0.5 px-3">
                {d.authorisedSignatoryText}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
