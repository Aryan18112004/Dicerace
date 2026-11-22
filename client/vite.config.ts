import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// in dev the API and websocket live on :3000, proxy so the client can use relative urls
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3000",
      "/ws": { target: "ws://localhost:3000", ws: true },
    },
  },
});
