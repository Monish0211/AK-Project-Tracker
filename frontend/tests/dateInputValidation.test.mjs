// Frontend date-input validation tests (Oct 2026).
// Run: npm test  (node:test + Vite's own SSR module loader — no extra
// dependency; Vite resolves the app's TypeScript/JSX and import.meta.env
// exactly as the real build does).
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

let vite;
let load;
before(async () => {
  vite = await createServer({
    root: fileURLToPath(new URL("..", import.meta.url)),
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom",
    logLevel: "error",
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  load = (p) => vite.ssrLoadModule(p);
});
after(() => vite?.close());

test("isValidDateInput / dateInputError mirror the backend rules", async () => {
  const { isValidDateInput, dateInputError } = await load("/src/utils/dateInputValidation.ts");
  for (const ok of ["2026-04-01", "2024-02-29", "1900-01-01", "2100-12-31", "2026-01-01T00:00:00.000Z", "2026-10-01T10:30:00+05:30", "", "  ", null, undefined]) {
    assert.equal(isValidDateInput(ok), true, JSON.stringify(ok));
  }
  for (const bad of ["20226-04-01", "+020226-04-01", "2026-02-30", "2025-02-29", "2026-13-01", "1899-12-31", "2101-01-01", "01/04/2026", "abc", "2026-01-01T24:00:00Z"]) {
    assert.equal(isValidDateInput(bad), false, bad);
  }
  assert.equal(dateInputError("Project End Date", "20226-04-01"), "Project End Date must be a valid date with a year between 1900 and 2100.");
  assert.equal(dateInputError("Project End Date", "2026-04-01"), undefined);
  assert.equal(dateInputError("Project End Date", ""), undefined, "empty is not this check's concern (required-ness is separate)");
});

test("General tab: invalid typed dates are reported; required messages keep priority", async () => {
  const { validateGeneralTab } = await load("/src/utils/projectValidation.ts");
  const { createEmptyProject } = await load("/src/utils/createEmptyProject.ts");
  const valid = { ...createEmptyProject(), poMonth: "2026-10", prCategory: "India", prNo: "PR-1", rfqNo: "R", projectTitle: "T", client: "C", department: "D", domesticForeign: "Domestic", workOrderStatus: "Received", projectStatus: "Active", projectStartDate: "2026-03-02", projectEndDate: "2026-04-01", contractType: "LUMP SUM", pmoCoordinator: "P", workOrderNumber: "W", workOrderDate: "2026-03-02", eicName: "E" };
  assert.deepEqual(validateGeneralTab(valid), {}, "a fully valid project has no errors");

  const errors = validateGeneralTab({ ...valid, projectStartDate: "2026-02-30", projectEndDate: "20226-04-01", workOrderDate: "abc" });
  assert.match(errors.projectStartDate, /Project Start Date must be a valid date/);
  assert.match(errors.projectEndDate, /Project End Date must be a valid date/);
  assert.match(errors.workOrderDate, /Work Order Date must be a valid date/);

  assert.equal(validateGeneralTab({ ...valid, projectStartDate: "" }).projectStartDate, "Project Start Date is required.", "required wins");
  assert.equal(validateGeneralTab({ ...valid, projectEndDate: "" }).projectEndDate, undefined, "optional end date may stay empty");

  assert.equal(validateGeneralTab({ ...valid, actualCompletionDate: "20226-01-01" }).actualCompletionDate, undefined, "hidden unless Completed");
  assert.match(validateGeneralTab({ ...valid, projectStatus: "Completed", actualCompletionDate: "20226-01-01" }).actualCompletionDate, /Actual Completion Date/);
});

test("Payment milestones: invalid due dates are reported per row; empty stays allowed", async () => {
  const { validatePaymentMilestonesTab } = await load("/src/utils/projectValidation.ts");
  const single = validatePaymentMilestonesTab({ paymentType: "Single", paymentMilestones: [{ milestoneName: "M", paymentPercentage: 100, dueDate: "2026-02-30" }] });
  assert.match(single.milestone_due_0, /Due Date must be a valid date/);
  const multi = validatePaymentMilestonesTab({ paymentType: "Multiple", paymentMilestones: [
    { milestoneName: "A", paymentPercentage: 50, dueDate: "2026-06-30" },
    { milestoneName: "B", paymentPercentage: 50, dueDate: "20226-06-30" },
    { milestoneName: "C", paymentPercentage: 10, dueDate: "" },
  ] });
  assert.equal(multi.milestone_due_0, undefined);
  assert.match(multi.milestone_due_1, /Due Date/);
  assert.equal(multi.milestone_due_2, undefined);
});

test("Planned Completion Date never throws on an extreme typed start date", async () => {
  const { getPlannedCompletionDate } = await load("/src/utils/projectScheduling.ts");
  assert.equal(getPlannedCompletionDate({ projectStartDate: "2026-03-01", estimatedDuration: 10, durationUnit: "Days" }), "2026-03-11");
  assert.doesNotThrow(() => getPlannedCompletionDate({ projectStartDate: "275760-09-13", estimatedDuration: 5, durationUnit: "Months" }));
  assert.equal(getPlannedCompletionDate({ projectStartDate: "275760-09-13", estimatedDuration: 5, durationUnit: "Months" }), "");
});

test("Input: date fields get the 1900–2100 calendar range; a caller's own min/max wins", async () => {
  // React itself is CommonJS: import it natively (Vite SSR externalizes it, so it is the same instance).
  const React = (await import("react")).default;
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { Input } = await load("/src/components/ui/Input.tsx");
  const plain = renderToStaticMarkup(React.createElement(Input, { type: "date", value: "", readOnly: true }));
  assert.match(plain, /min="1900-01-01"/);
  assert.match(plain, /max="2100-12-31"/);
  const own = renderToStaticMarkup(React.createElement(Input, { type: "date", min: "2026-03-01", max: "2026-04-01", value: "", readOnly: true }));
  assert.match(own, /min="2026-03-01"/);
  assert.match(own, /max="2026-04-01"/);
  const text = renderToStaticMarkup(React.createElement(Input, { type: "text", value: "", readOnly: true }));
  assert.doesNotMatch(text, /min=|max=/, "non-date inputs are untouched");
});
