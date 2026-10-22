// IFE logo (Oct 2026): the provided image is the master and is never altered; the UI uses renditions of it; every place that showed the
// old mark (sidebar tile, Login + loading screen via <Logo>, favicon / touch icon, notification icon + badge) now uses it.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const file = (rel) => readFileSync(root + rel);
const text = (rel) => file(rel).toString("utf8");
const png = (rel) => { const b = file(rel); assert.equal(b.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", `${rel} is a PNG`); return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), colorType: b[25] }; };

let vite; let React; let renderToStaticMarkup; let load;
before(async () => {
  globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  globalThis.window = { matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }), dispatchEvent() {}, addEventListener() {}, removeEventListener() {} };
  vite = await createServer({ root, server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom", logLevel: "error", optimizeDeps: { noDiscovery: true, include: [] } });
  load = (p) => vite.ssrLoadModule(p);
  React = (await import("react")).default;
  ({ renderToStaticMarkup } = await import("react-dom/server"));
});
after(() => vite?.close());

test("the master is the provided image, byte for byte (SHA-256), 1254×1254 — never re-encoded or recoloured", () => {
  assert.equal(createHash("sha256").update(file("src/assets/brand/ife-logo-master.png")).digest("hex"), "8e59421dd355a86ab27b8a5518bcaa3e3a31579f78687edc81473340de616088");
  assert.deepEqual(png("src/assets/brand/ife-logo-master.png"), { w: 1254, h: 1254, colorType: 2 });
});

test("every rendition is a SQUARE PNG at its stated size with transparent corners (RGBA) — the logo's own 1:1 ratio is preserved", () => {
  const sizes = { "src/assets/brand/ife-logo-256.png": 256, "public/icons/ife-512.png": 512, "public/icons/ife-192.png": 192, "public/icons/ife-180.png": 180, "public/icons/ife-32.png": 32, "public/icons/ife-badge-96.png": 96 };
  for (const [rel, size] of Object.entries(sizes)) assert.deepEqual(png(rel), { w: size, h: size, colorType: 6 }, rel);
});

test("favicon, touch icon and notification icon / badge point at the IFE logo", () => {
  const html = text("index.html");
  assert.match(html, /rel="icon"[^>]*sizes="32x32"[^>]*href="\/icons\/ife-32\.png"/);
  assert.match(html, /rel="icon"[^>]*sizes="192x192"[^>]*href="\/icons\/ife-192\.png"/);
  assert.match(html, /rel="icon"[^>]*sizes="512x512"[^>]*href="\/icons\/ife-512\.png"/);
  assert.match(html, /rel="apple-touch-icon"[^>]*href="\/icons\/ife-180\.png"/);
  assert.doesNotMatch(html, /pmo-192|pmo-badge/);
  const sw = text("public/sw.js");
  assert.match(sw, /DEFAULT_ICON = "\/icons\/ife-192\.png"/);
  assert.match(sw, /DEFAULT_BADGE = "\/icons\/ife-badge-96\.png"/);
  for (const f of ["ife-32", "ife-192", "ife-512", "ife-180", "ife-badge-96"]) assert.ok(existsSync(root + `public/icons/${f}.png`), f);
});

test("<Logo> (Login page) renders the IFE logo by default, undistorted (object-contain, caller-set height, auto width) and without the old card chrome", async () => {
  const { Logo } = await load("/src/components/ui/Logo.tsx");
  const html = renderToStaticMarkup(React.createElement(Logo, { alt: "iFluids Engineering", imageClassName: "h-16 w-auto object-contain", containerClassName: "mb-5" }));
  assert.match(html, /<img[^>]*src="[^"]*ife-logo-256[^"]*"/);
  assert.match(html, /class="h-16 w-auto object-contain"/);
  assert.match(html, /alt="iFluids Engineering"/);
  assert.doesNotMatch(html, /bg-white|shadow-md|border-slate|logo-light|logo-dark/, "no card around the self-contained tile");
});

test("the LOADING SCREEN keeps the previous logo: <Logo variant=\"wordmark\"> is the original theme-aware wordmark (light file on a white card, dark file without) at the original sizes", async () => {
  const { Logo } = await load("/src/components/ui/Logo.tsx");
  const { ThemeProvider } = await load("/src/context/ThemeContext.tsx");
  const html = renderToStaticMarkup(React.createElement(ThemeProvider, null, React.createElement(Logo, { variant: "wordmark", alt: "iFluids Engineering", imageClassName: "h-11 sm:h-14 w-auto object-contain", darkImageClassName: "h-14 sm:h-18 w-auto object-contain", containerClassName: "px-0 py-0" })));
  assert.match(html, /<img[^>]*src="[^"]*logo-light[^"]*"/, "the original light-theme wordmark (default theme)");
  assert.doesNotMatch(html, /ife-logo/);
  assert.match(html, /bg-white rounded-2xl border border-slate-200\/80 shadow-md/, "the original card in Light Mode");
  const carousel = text("src/components/LoadingScreen/RotatingCarousel.tsx");
  assert.match(carousel, /<Logo[^>]*variant="wordmark"[^>]*imageClassName="h-11 sm:h-14 w-auto object-contain"[^>]*darkImageClassName="h-14 sm:h-18 w-auto object-contain"/s, "original sizes");
  const logo = text("src/components/ui/Logo.tsx");
  assert.match(logo, /logo-light\.jpg/);
  assert.match(logo, /logo-dark\.png/);
});

test("the Sidebar tile is the IFE logo at 1:1 (44×44, object-contain); the old droplet icon is gone", () => {
  const sidebar = text("src/components/Sidebar/Sidebar.tsx");
  assert.match(sidebar, /import ifeLogo from "..\/..\/assets\/brand\/ife-logo-256\.png"/);
  assert.match(sidebar, /pmo-brand-mark relative h-11 w-11 shrink-0/, "44px, the same in the icon rail and the wide sidebar");
  assert.match(sidebar, /<img src=\{ifeLogo\}[^>]*className="relative z-10 h-full w-full object-contain/, "natural 1:1, contained");
  assert.match(sidebar, /pmo-brand-glow[^]*pmo-brand-shine[^]*pmo-brand-name[^]*pmo-brand-line/, "the creative brand block: glow, shine, gradient wordmark, accent line");
  assert.match(sidebar, /@media \(prefers-reduced-motion: reduce\) \{\s*\.pmo-brand-glow \{ animation: none/, "motion is switched off for users who ask for less")
  assert.doesNotMatch(sidebar, /Droplet/);
});

test("the old website logo and icons are only used where intended: the loading screen wordmark and the PDF report letterhead — not the sidebar, Login, favicon or notification icons", () => {
  const sources = ["src/components/Sidebar/Sidebar.tsx", "src/pages/Login/Login.tsx", "index.html", "public/sw.js"].map(text).join(" ");
  assert.doesNotMatch(sources, /assets\/logo-light|assets\/logo-dark|\/icons\/pmo-(192|badge)/);
  assert.doesNotMatch(text("src/pages/Login/Login.tsx"), /variant="wordmark"|darkImageClassName/, "Login uses the IFE logo");
  assert.match(text("src/reports/projectPdf/buildProjectFinancialPdf.ts"), /logo-report\.jpg\?inline/, "documented exception: the printed report letterhead keeps its wordmark");
});
