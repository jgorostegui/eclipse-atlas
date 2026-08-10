import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

// The deployment edge stamps X-Timer on every response and the live clock
// calibrates against it. In development and preview the serving machine is
// the device itself, so its own time is an honest stand-in and the calibrated
// flow can be exercised locally.
function devClockProbe(): Plugin {
  const stamp = (res: { setHeader: (name: string, value: string) => void }) => {
    res.setHeader("X-Timer", `S${(Date.now() / 1000).toFixed(6)},VS0,VE0`);
  };
  return {
    name: "eclipse-atlas:dev-clock-probe",
    configureServer(server) {
      server.middlewares.use((_request, response, next) => {
        stamp(response);
        next();
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((_request, response, next) => {
        stamp(response);
        next();
      });
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [react(), devClockProbe()],
  server: {
    port: 3000,
    strictPort: true,
  },
  preview: {
    port: 3000,
    strictPort: true,
  },
  build: {
    sourcemap: false,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: "react-vendor",
              test: /node_modules\/(?:react|react-dom|scheduler)\//,
            },
            {
              name: "astronomy-engine",
              test: /node_modules\/astronomy-engine\//,
            },
          ],
        },
      },
    },
  },
});
