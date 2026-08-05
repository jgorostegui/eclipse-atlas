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

createRoot(root).render(
  <StrictMode>
    <I18nProvider>
      <AppErrorBoundary>
        <EclipsePlanner />
      </AppErrorBoundary>
    </I18nProvider>
  </StrictMode>,
);
