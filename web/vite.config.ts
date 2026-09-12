import { copyFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";
import wasm from "vite-plugin-wasm";
import { defineConfig } from "vitest/config";
import { localFunding } from "./vite.local-funding.ts";

function syncManifest(): Plugin {
  const copy = () => {
    const target = fileURLToPath(new URL("./public/", import.meta.url));
    mkdirSync(target, { recursive: true });
    copyFileSync(
      fileURLToPath(new URL("../runtime/local.json", import.meta.url)),
      fileURLToPath(new URL("./public/local.json", import.meta.url)),
    );
  };
  return {
    name: "sync-local-manifest",
    configureServer() {
      copy();
    },
    buildStart() {
      copy();
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), wasm(), syncManifest(), localFunding()],
  server: {
    host: "127.0.0.1",
    fs: {
      deny: [
        ".env",
        ".env.*",
        "*.{crt,pem}",
        "**/.git/**",
        "**/.keys/**",
        "**/*-keypair.json",
      ],
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
