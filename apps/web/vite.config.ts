import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";

// `npm run dev:phone` serves over HTTPS on your local network so phones can
// use the camera form check (browsers only allow cameras on secure pages).
const phone = process.env.DEV_PHONE === "1";

// In development the API runs on :4000 and is proxied under /api so that the
// session cookie is same-origin.
export default defineConfig({
  plugins: [react(), ...(phone ? [basicSsl()] : [])],
  server: {
    port: 5173,
    host: phone ? true : undefined,
    proxy: {
      "/api": {
        target: process.env.API_PROXY_TARGET ?? "http://localhost:4000",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ""),
      },
    },
  },
  preview: {
    port: 4173,
    proxy: {
      "/api": {
        target: process.env.API_PROXY_TARGET ?? "http://localhost:4000",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ""),
      },
    },
  },
});
