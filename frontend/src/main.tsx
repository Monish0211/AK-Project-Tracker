import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";

import { ThemeProvider } from "./context/ThemeContext";
import { registerServiceWorker } from "./notifications/pushSubscriptionService";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>
);

// Priority #6, Phase 2 — registers /sw.js only; requests no permission and
// creates no subscription (see pushSubscriptionService.ts's own comment).
// Fire-and-forget: never blocks the initial render, and registerServiceWorker()
// itself never throws even on an unsupported browser.
void registerServiceWorker();
