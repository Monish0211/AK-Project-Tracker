/**
 * Component-based Print Utility
 *
 * Prints ONE isolated DOM subtree by cloning it into a hidden, real-A4-sized
 * same-origin iframe and calling print() on the IFRAME's own window — never
 * on the main window. This guarantees the printed/PDF output can only ever
 * contain the cloned invoice node: no sidebar, no open drawers/portals, no
 * notifications, nothing else from the live application.
 *
 * Root causes this fixes (see the print-pipeline investigation):
 *
 *  1. THE IFRAME WAS 0x0 (`width:0;height:0`). A zero-size iframe hands
 *     Chrome's print engine a degenerate layout viewport to compute
 *     pagination from, and — critically — makes `iframe.contentWindow
 *     .focus()` unreliable at actually transferring print focus to the
 *     iframe. When focus doesn't transfer, `iframe.contentWindow.print()`
 *     can silently fall back to printing the TOP-LEVEL window instead —
 *     which is exactly how portal-rendered app UI (drawers, notifications,
 *     etc. — all mounted straight onto `document.body`, entirely outside
 *     this function's control) ends up in the printed output, and why the
 *     failure was intermittent (a focus/timing race) rather than constant.
 *     Fixed by giving the iframe real A4 dimensions (210mm x 297mm)
 *     positioned far off-screen: invisible to the user, but a real,
 *     non-degenerate layout box for the browser's print engine.
 *
 *  2. Readiness was checked against the PARENT document's fonts
 *     (`document.fonts.ready`), while the iframe has its own, completely
 *     separate `document` with its own FontFaceSet — waiting on the wrong
 *     one told us nothing about whether the iframe's own fonts had
 *     actually finished loading, which is what produced the "half of the
 *     invoice" / mid-reflow prints. Fixed by awaiting the iframe's OWN
 *     `doc.fonts.ready`, plus every `<img>` inside the clone.
 *
 *  3. The iframe was torn down on a flat `setTimeout(1000)` immediately
 *     after calling print(), regardless of whether the browser had
 *     actually finished reading from it — removing the DOM the print
 *     engine is still rasterizing from is a direct cause of blank/partial
 *     pages. Fixed by waiting for the iframe's own `afterprint` event
 *     (with a generous fallback timer only as a safety net for the rare
 *     browser/flow that never fires it).
 */
export async function printComponentElement(element: HTMLElement, title: string = "Tax Invoice") {
  if (!element) return;

  // Positioned far off-screen — never display:none / width:0 / height:0 —
  // so it gets a real, non-degenerate A4 layout box. See root cause #1.
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.top = "-10000px";
  iframe.style.left = "-10000px";
  iframe.style.width = "210mm";
  iframe.style.height = "297mm";
  iframe.style.border = "0";
  iframe.setAttribute("aria-hidden", "true");
  iframe.title = title;

  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    document.body.removeChild(iframe);
    return;
  }

  // Copy every style/link tag from the main document so the clone's own
  // Tailwind utility classes render correctly. Harmless for anything else
  // in there: a CSS rule only ever matches a className actually present on
  // an element, and the iframe's only content is the cloned invoice node —
  // there is nothing else in there for any other rule to apply to.
  let stylesHtml = "";
  document.querySelectorAll("style, link[rel='stylesheet']").forEach((styleNode) => {
    stylesHtml += styleNode.outerHTML;
  });

  doc.open();
  doc.write(`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <title>${title}</title>
        ${stylesHtml}
        <style>
          @page {
            size: A4 portrait;
            margin: 5mm 6mm;
          }
          *, *::before, *::after {
            box-sizing: border-box !important;
          }
          html, body {
            background: #ffffff !important;
            color: #000000 !important;
            margin: 0 !important;
            padding: 0 !important;
            width: 210mm !important;
            height: auto !important;
            min-height: auto !important;
            overflow: visible !important;
            font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
          }
          .invoice-document-root {
            width: 100% !important;
            max-width: 210mm !important;
            margin: 0 auto !important;
            padding: 0 !important;
            border: none !important;
            box-shadow: none !important;
            background: #ffffff !important;
            color: #000000 !important;
            overflow: visible !important;
            height: auto !important;
            min-height: auto !important;
            display: block !important;
          }
          /* Continuous document flow with no forced breaks */
          div, table, tr, td, th {
            page-break-before: auto !important;
            break-before: auto !important;
            page-break-after: auto !important;
            break-after: auto !important;
            page-break-inside: auto !important;
            break-inside: auto !important;
          }
        </style>
      </head>
      <body>
        <div id="invoice-root"></div>
      </body>
    </html>
  `);
  doc.close();

  // Clone ONLY the target invoice node — zero parent-application DOM.
  const clone = element.cloneNode(true) as HTMLElement;
  const container = doc.getElementById("invoice-root");
  (container ?? doc.body).appendChild(clone);

  await waitForIframeReady(doc);

  const printWindow = iframe.contentWindow;
  if (!printWindow) {
    document.body.removeChild(iframe);
    return;
  }

  // Cleanup fires once printing is actually finished — signaled by the
  // iframe's OWN `afterprint` event (the browser fires this once the print
  // dialog/PDF export closes), never an arbitrary timer. The fallback timer
  // exists only as a safety net for browsers/flows that don't reliably
  // fire it, so the iframe is never leaked permanently.
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    printWindow.removeEventListener("afterprint", cleanup);
    if (document.body.contains(iframe)) {
      document.body.removeChild(iframe);
    }
  };
  printWindow.addEventListener("afterprint", cleanup);
  setTimeout(cleanup, 60_000);

  try {
    printWindow.focus();
    printWindow.print();
  } catch (err) {
    console.error("Print error:", err);
    cleanup();
  }
}

/**
 * Resolves once the iframe's OWN document (never the parent's) has settled:
 * its fonts are loaded, every image inside the clone has loaded, and the
 * browser has completed at least one full layout+paint pass. This is the
 * proper rendering-synchronization strategy — real signals the browser
 * exposes — replacing the previous arbitrary `setTimeout` delay.
 */
async function waitForIframeReady(doc: Document): Promise<void> {
  if (doc.fonts?.ready) {
    try {
      await doc.fonts.ready;
    } catch {
      // A font-loading failure shouldn't block printing — fall through.
    }
  }

  const images = Array.from(doc.images);
  await Promise.all(
    images.map((img) =>
      img.complete
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            img.addEventListener("load", () => resolve(), { once: true });
            img.addEventListener("error", () => resolve(), { once: true });
          })
    )
  );

  // One full layout+paint cycle inside the iframe's OWN window, so print()
  // never fires against a still-settling layout.
  const iframeWindow = doc.defaultView ?? window;
  await new Promise<void>((resolve) => {
    iframeWindow.requestAnimationFrame(() => {
      iframeWindow.requestAnimationFrame(() => resolve());
    });
  });
}
