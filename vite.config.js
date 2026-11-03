import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  base: "/liveai/",
  plugins: [react()],
  server: {
    proxy: {
      "/liveai/api": {
        target: "http://127.0.0.1:4260",
        ws: true,
        rewrite: (p) => p.replace(/^\/liveai/, ""),
      },
    },
  },
});
