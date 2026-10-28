import "./instrument";
import * as Sentry from "@sentry/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";

import { ThemeProvider } from "./context/ThemeContext";
import { registerServiceWorker } from "./notifications/pushSubscriptionService";
import { AppErrorFallback } from "./components/AppErrorFallback";
import { installLazyChunkRecovery } from "./utils/lazyChunkRecovery";

// Before anything renders: a tab opened before a deployment asks for chunk files that no longer exist; reload once (guarded) to pick up the new ones.
installLazyChunkRecovery();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Sentry.ErrorBoundary fallback={({ error }) => <AppErrorFallback error={error} />}>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </Sentry.ErrorBoundary>
  </StrictMode>
);

// Priority #6, Phase 2 — registers /sw.js only; requests no permission and
// creates no subscription (see pushSubscriptionService.ts's own comment).
// Fire-and-forget: never blocks the initial render, and registerServiceWorker()
// itself never throws even on an unsupported browser.
void registerServiceWorker();
