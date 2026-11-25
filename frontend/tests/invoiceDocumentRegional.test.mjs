// The printed / PDF invoice document (production mapper) for a project in another country: printed in the invoice's own currency with the right words, the rate stated
// in the PROJECT currency, no Indian issuer details, no Indian tax code or GST - while an India invoice is byte-for-byte the document it always was.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

let vite;
let mapper;
let indian;
before(async () => {
  vite = await createServer({
    root: fileURLToPath(new URL("..", import.meta.url)),
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom",
    logLevel: "error",
    optimizeDeps: { noDiscovery: true, include: [] },
    plugins: [
      {
        name: "stub-notification-service",
        enforce: "pre",
        load(id) {
          return id.split("\\").join("/").endsWith("/src/notifications/notificationService.ts") ? "export const notificationService = new Proxy({}, { get: () => () => undefined });" : null;
        },
      },
    ],
  });
  mapper = await vite.ssrLoadModule("/src/services/invoice/invoiceDocumentMapper.ts");
  indian = (await vite.ssrLoadModule("/src/services/invoice/numberToWords.ts")).numberToIndianWords;
});
after(() => vite?.close());

const line = (over) => ({ id: "l1", invoiceNo: "INV-1", invoiceDate: "2026-11-10", quantityBilled: 2, status: "Raised", createdBy: "t", ...over });
const projectWith = (over, lineOver) => ({
  id: "p1",
  prNo: "PR-1",
  prCategory: "India",
  client: "Client",
  eicName: "",
  projectStartDate: "2026-01-01",
  paymentMilestones: [],
  invoiceDocumentDetailsMap: {},
  invoiceItems: [{ id: "i1", description: "Engineering", qty: 2, uom: "DAY", unitPrice: 100, totalPrice: 200, invoices: [line(lineOver)] }],
  ...over,
});
const dto = (project) => mapper.mapProjectToInvoiceDocumentDTO(project, "INV-1", {});

test("Oman: a USD invoice prints in USD with its own rate to OMR, the words in USD, and no Indian issuer, tax code or GST", () => {
  const d = dto(
    projectWith(
      { regionalCurrency: "OMR", prCategory: "Oman", currency: "USD" },
      { unitPriceINR: 115.5, invoiceAmountINR: 231, invoiceAmountOriginal: 600, currency: "USD", exchangeRateToINR: 0.385, projectCurrency: "OMR" }
    )
  );
  assert.equal(d.invoiceCurrency, "USD");
  assert.equal(d.projectCurrency, "OMR");
  assert.equal(d.exchangeRateToINR, 0.385);
  assert.equal(d.grandTotalOriginal, 600);
  assert.equal(d.subtotalOriginal, 600);
  assert.equal(d.amountInWords, "USD Six Hundred Only");
  assert.equal(d.isGstApplicable, false);
  assert.equal(d.lineItems[0].amountOriginal, 600);
  assert.equal(d.lineItems[0].basicUnitRateOriginal, 300, "OMR 115.500 / 0.385 = USD 300");
  assert.equal(d.lineItems[0].hsnSac, "");
  assert.equal(d.lineItems[0].gstRatePercent, 0);
  for (const field of ["companyName", "companyGstin", "companyState", "companyStateCode", "companyEmail", "companyPan", "bankName", "accountNo", "companySignatureText"]) {
    assert.equal(d[field], "", `${field} must carry no Indian issuer detail`);
  }
  assert.match(d.companyAddress, /Issuer details for Oman are not configured yet/);
  assert.ok(!/Chennai|Tamil|600030|33AAFFI|Union Bank|530601|ifluids\.com/i.test(JSON.stringify(d)), "nothing of the Chennai issuer anywhere in the document");
});

test("Oman: an invoice in OMR itself prints in OMR with three decimals, no rate note, and the words in OMR", () => {
  const d = dto(
    projectWith(
      { regionalCurrency: "OMR", prCategory: "Oman", currency: "OMR" },
      { unitPriceINR: 115.5, invoiceAmountINR: 231, invoiceAmountOriginal: 231, currency: "OMR", exchangeRateToINR: 1, projectCurrency: "OMR" }
    )
  );
  assert.equal(d.invoiceCurrency, "OMR");
  assert.equal(d.projectCurrency, "OMR");
  assert.equal(d.grandTotalOriginal, 231);
  assert.equal(d.amountInWords, "OMR Two Hundred Thirty One Only");
  assert.equal(d.lineItems[0].basicUnitRateOriginal, 115.5);
});

test("Abu Dhabi: an INR invoice (1 INR = AED 0.012) prints in INR words with no GST, and the equivalent is in AED", () => {
  const d = dto(
    projectWith(
      { regionalCurrency: "AED", prCategory: "Abu Dhabi", currency: "INR", gstApplicable: true },
      { unitPriceINR: 600, invoiceAmountINR: 1200, invoiceAmountOriginal: 100000, currency: "INR", exchangeRateToINR: 0.012, projectCurrency: "AED" }
    )
  );
  assert.equal(d.invoiceCurrency, "INR");
  assert.equal(d.projectCurrency, "AED");
  assert.equal(d.isGstApplicable, false, "GST is an India rule: an INR invoice on an Abu Dhabi project carries none");
  assert.equal(d.grandTotalOriginal, 100000);
  assert.equal(d.grandTotalINR, 1200, "the project-currency equivalent, under its historic field name");
  assert.match(d.amountInWords, /^INR /);
  assert.equal(d.taxAmountInWords, "NIL");
});

test("every other country prints no Indian issuer either (Malaysia, FZE, Elixir Qatar, Qatar)", () => {
  for (const [category, currency] of [["Malaysia", "MYR"], ["FZI", "AED"], ["Elixir Qatar", "QAR"], ["Qatar", "QAR"]]) {
    const d = dto(projectWith({ regionalCurrency: currency, prCategory: category, currency }, { unitPriceINR: 50, invoiceAmountINR: 100, invoiceAmountOriginal: 100, currency, exchangeRateToINR: 1, projectCurrency: currency }));
    assert.equal(d.invoiceCurrency, currency);
    assert.equal(d.companyName, "");
    assert.equal(d.companyGstin, "");
    const shown = category === "FZI" ? "FZE" : category; // the stored FZI is shown as FZE
    assert.ok(d.companyAddress.includes(shown), `${category}: the notice names the country`);
    assert.equal(d.amountInWords.startsWith(currency + " "), true);
  }
});

test("details typed into the invoice's own document details are honoured for another country (nothing is invented, nothing is overwritten)", () => {
  const p = projectWith({ regionalCurrency: "QAR", prCategory: "Qatar", currency: "QAR" }, { unitPriceINR: 50, invoiceAmountINR: 100, invoiceAmountOriginal: 100, currency: "QAR", exchangeRateToINR: 1, projectCurrency: "QAR" });
  const d = mapper.mapProjectToInvoiceDocumentDTO(p, "INV-1", { bankName: "Typed Bank", accountNo: "123", branch: "Doha", ifscCode: "SWIFT1", companySignatureText: "for Typed Co" });
  assert.equal(d.bankName, "Typed Bank");
  assert.equal(d.accountNo, "123");
  assert.equal(d.branchAndIfsc, "Doha & SWIFT1");
  assert.equal(d.companySignatureText, "for Typed Co");
});

test("India is unchanged: the same Chennai issuer, HSN/SAC and rupee document, with no project-currency field", () => {
  const d = dto(projectWith({}, { unitPriceINR: 100, invoiceAmountINR: 200 }));
  assert.equal(d.companyName, "iFluids Engineering");
  assert.equal(d.companyGstin, "33AAFFI1423E1Z1");
  assert.equal(d.companyState, "Tamil Nadu");
  assert.equal(d.companyPan, "AAFFI1423E");
  assert.equal(d.bankName, "Union Bank of India");
  assert.equal(d.accountNo, "530601010038789");
  assert.equal(d.branchAndIfsc, "Anna Nagar & UBIN0553069");
  assert.equal(d.companySignatureText, "for iFluids Engineering");
  assert.equal(d.lineItems[0].hsnSac, "998399");
  assert.equal(d.invoiceCurrency, "INR");
  assert.equal(d.exchangeRateToINR, 1);
  assert.equal("projectCurrency" in d, false);
  assert.equal(d.amountInWords, indian(200));
  const usd = dto(projectWith({}, { unitPriceINR: 9500, invoiceAmountINR: 19000, invoiceAmountOriginal: 200, currency: "USD", exchangeRateToINR: 95 }));
  assert.equal(usd.invoiceCurrency, "USD");
  assert.equal(usd.exchangeRateToINR, 95);
  assert.equal(usd.grandTotalOriginal, 200);
  assert.equal(usd.amountInWords, "USD Two Hundred Only");
  assert.equal("projectCurrency" in usd, false);
  assert.equal(usd.companyName, "iFluids Engineering");
});
