import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  base: "/AK-Project-Tracker/",
  plugins: [
    react(),
    tailwindcss(),
  ],
});