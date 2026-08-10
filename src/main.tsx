import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import "@fontsource/ibm-plex-mono/latin-600.css";
import "@fontsource/manrope/latin-400.css";
import "@fontsource/manrope/latin-700.css";
import "leaflet/dist/leaflet.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import EclipsePlanner from "./features/planner/EclipsePlanner";
import { AppErrorBoundary } from "./features/errors/AppErrorBoundary";
import { I18nProvider } from "./i18n/I18nProvider";
import "./styles/app.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("The application root element is missing.");
}

// Offline shell for the live eclipse mode. Local hosts are excluded so a
// preview build cannot leave a worker controlling the dev server origin.
if (
  import.meta.env.PROD &&
  "serviceWorker" in navigator &&
  !["localhost", "127.0.0.1"].includes(window.location.hostname)
) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {
      // The app works without offline copies; a failed registration is not
      // worth interrupting anyone over.
    });
  });
}

createRoot(root).render(
  <StrictMode>
    <I18nProvider>
      <AppErrorBoundary>
        <EclipsePlanner />
      </AppErrorBoundary>
    </I18nProvider>
  </StrictMode>,
);
