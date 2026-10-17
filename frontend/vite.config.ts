import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  base: process.env.GITHUB_ACTIONS === "true" ? "/AK-Project-Tracker/" : "/",
  plugins: [
    react(),
    tailwindcss(),
  ],
  // The Project Financial Report PDF worker is created as a module worker
  // ({ type: "module" }); ES output lets it code-split, so jsPDF's optional
  // html2canvas/DOMPurify/canvg imports stay separate, never-loaded chunks
  // instead of being inlined into the worker file.
  worker: { format: "es" },
});