import "./dashboard-atmosphere.css";

/**
 * Production-quality ambient background for the dashboard workspace.
 * Purely decorative — absolutely positioned, non-interactive, and painted
 * behind all dashboard content. See Dashboard.tsx's ENABLE_DASHBOARD_BACKGROUND
 * flag to disable, or delete this file + dashboard-atmosphere.css to remove
 * it completely; nothing else in the dashboard depends on it.
 *
 * Two blended gradient-mesh bands (a soft, drifting light field) sit below
 * a static blueprint drafting-grid — the whole stack fades out via a mask
 * on the outer container, sized off --atmo-reach (viewport-height-relative,
 * see dashboard-atmosphere.css) rather than a fixed pixel cutoff.
 */
const DashboardAtmosphere = () => (
  <div className="dashboard-atmosphere" aria-hidden="true">
    <div className="dashboard-atmosphere__mesh dashboard-atmosphere__mesh--a" />
    <div className="dashboard-atmosphere__mesh dashboard-atmosphere__mesh--b" />
    <div className="dashboard-atmosphere__grid" />
  </div>
);

export default DashboardAtmosphere;
