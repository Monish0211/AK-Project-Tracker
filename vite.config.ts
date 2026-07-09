import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  base: process.env.GITHUB_ACTIONS === "true" ? "/AK-Project-Tracker/" : "/",
  plugins: [
    react(),
    tailwindcss(),
  ],
});