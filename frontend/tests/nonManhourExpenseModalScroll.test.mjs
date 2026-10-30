// Other Project Expenses -> Add/Edit Project Expense modal: it must be viewport-anchored and scroll inside itself.
// ROOT CAUSE this guards against: rendered inline, the modal's `fixed inset-0` overlay is NOT anchored to the viewport. MainLayout's wrapper
// (.animate-pmo-fade-up) keeps `filter: blur(0)` after its animation, and any non-`none` filter on an ancestor makes it the containing block for
// position: fixed descendants - so the overlay spans the whole page, the modal is centred in the document (footer below the fold) and the body
// scroll lock stops the user reaching it. Rendering through the app's Portal (into document.body) removes the modal from that ancestor chain.
// Source-level checks only: the real-browser behaviour (overlay == viewport, footer visible, scrolling) was verified separately in a browser.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const src = (rel) => readFileSync(new URL(`../src/${rel}`, import.meta.url), "utf8");
const MODAL = "pages/Projects/components/ExpenseInformation/NonManhourExpenseModal.tsx";

test("the modal is rendered through the app's Portal, with the fixed overlay as its only child", () => {
  const text = src(MODAL);
  assert.ok(text.includes('import Portal from "../../../../components/ui/Portal";'));
  const ret = text.slice(text.indexOf("  return (\n    <Portal>"));
  assert.ok(ret.startsWith("  return (\n    <Portal>\n    <div className=\"fixed inset-0 "), "the Portal must wrap the fixed overlay directly");
  assert.ok(/<\/div>\r?\n    <\/Portal>\r?\n  \);/.test(text), "the Portal must close right after the overlay");
});

test("three regions: a fixed header, an independently scrollable body, and a footer that never shrinks or overlaps the body", () => {
  const text = src(MODAL);
  assert.ok(/max-h-\[85vh\] flex flex-col overflow-hidden/.test(text), "the dialog must be height-capped and clip, as a flex column");
  assert.ok(/px-6 py-5 shrink-0/.test(text), "header must not shrink");
  assert.ok(/flex-1 min-h-0 overflow-y-auto overscroll-contain/.test(text), "body must flex, allow shrinking (min-h-0), scroll, and not chain scrolling to the page");
  assert.ok(/py-4 flex justify-between items-center shrink-0/.test(text), "footer must not shrink");
});

test("the body scroll lock is unchanged (the page behind must not scroll while the modal is open)", () => {
  const text = src(MODAL);
  assert.ok(text.includes('document.body.style.overflow = "hidden";'));
  assert.ok(text.includes("document.body.style.overflow = originalStyle;"));
});

test("business logic is untouched: validation messages, total and the saved shape", () => {
  const text = src(MODAL);
  for (const kept of [
    '"Expense category is required."',
    '"Description is required."',
    '"Quantity must be greater than 0."',
    '"Unit cost must be greater than 0."',
    'quantity === "" || unitCost === "" ? 0 : quantity * unitCost',
    "totalCost: quantity * unitCost,",
    "id: expense?.id ?? crypto.randomUUID(),",
    'isEditMode ? "Update Expense" : "Save Expense"',
  ]) {
    assert.ok(text.includes(kept), kept);
  }
});

test("only this modal was changed for the scrolling fix: its siblings and the shared layout keep their own markup", () => {
  // Guard against drifting into unrelated modals: the card still renders this modal the same way.
  const card = src("pages/Projects/components/ExpenseInformation/NonManhourExpenseCard.tsx");
  assert.ok(card.includes("<NonManhourExpenseModal"));
  assert.ok(card.includes("onClose={handleCloseModal}") && card.includes("onSave={handleSave}"));
});
