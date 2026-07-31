import "./dashboard-aurora.css";

/**
 * Experimental ambient background for the dashboard workspace (prototype).
 * Purely decorative — absolutely positioned, non-interactive, and painted
 * behind all dashboard content. See Dashboard.tsx's ENABLE_AURORA_BACKGROUND
 * flag to disable, or delete this file + dashboard-aurora.css to remove it
 * completely; nothing else in the dashboard depends on it.
 *
 * Three color blobs (concentrated near the Hero/KPI area only) plus two
 * static texture layers — a dot-matrix grid and a faint noise/grain tile —
 * painted on top of them, in that order, so the composition reads as:
 * blobs → engineering texture → grain, then real dashboard content above all.
 */
const DashboardAurora = () => (
  <div className="dashboard-aurora" aria-hidden="true">
    <div className="dashboard-aurora__blob dashboard-aurora__blob--a" />
    <div className="dashboard-aurora__blob dashboard-aurora__blob--b" />
    <div className="dashboard-aurora__blob dashboard-aurora__blob--c" />
    <div className="dashboard-aurora__texture" />
    <div className="dashboard-aurora__noise" />
  </div>
);

export default DashboardAurora;
