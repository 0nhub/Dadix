import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

const host = process.env.TAURI_DEV_HOST;
const appSrc = fileURLToPath(new URL("../app/src", import.meta.url));
const bridge = (name: string) =>
  fileURLToPath(new URL(`./src/bridge/${name}`, import.meta.url));

function dadixDesktopAliases() {
  const apiBridge = bridge("callApi.ts");
  const constantsBridge = bridge("constants.ts");
  return {
    name: "dadix-desktop-aliases",
    enforce: "pre" as const,
    resolveId(source: string, importer?: string) {
      if (source === "@/constants") return constantsBridge;
      if (source === "@/lib/api" || source === "@/lib/api.ts") return apiBridge;
      if (source === "@/hooks/useRequireRole") {
        return fileURLToPath(new URL("./src/bridge/useRequireRole.ts", import.meta.url));
      }
      if (!importer) return null;
      const from = source.replace(/\\/g, "/");
      const by = importer.replace(/\\/g, "/");
      if (!by.includes("/app/src/")) return null;
      if (
        from === "./api" ||
        from === "../api" ||
        from === "./api.ts" ||
        from === "../api.ts" ||
        from.endsWith("/lib/api") ||
        from.endsWith("/lib/api.ts")
      ) {
        return apiBridge;
      }
      return null;
    },
    transform(code: string, id: string) {
      if (!id.includes("/app/src/") || !id.match(/\.[tj]sx?$/)) return null;
      if (!code.includes("document.location")) return null;
      let next = code.replace(/document\.location\.pathname/g, "window.__dadixPathname()");
      next = next.replace(
        /document\.location\.href\s*=\s*([^;]+);/g,
        "window.__dadixAssignHref($1);"
      );
      return next === code ? null : { code: next, map: null };
    },
  };
}

export default defineConfig(async () => ({
  plugins: [dadixDesktopAliases(), react(), tailwindcss()],
  define: {
    "process.env.NEXT_PUBLIC_API_URL": JSON.stringify(""),
    "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV ?? "production"),
  },
  resolve: {
    alias: [
      { find: "@/lib/api", replacement: bridge("callApi.ts") },
      { find: "@/hooks/useRequireRole", replacement: bridge("useRequireRole.ts") },
      { find: "@/context/AuthContext", replacement: bridge("AuthContext.tsx") },
      { find: "@/context/DashboardContext", replacement: bridge("DashboardContext.tsx") },
      { find: "@/components/dashboard/NewProjectDialog", replacement: bridge("NewProjectDialog.tsx") },
      { find: "@/components/dashboard/ConnectDialog", replacement: bridge("ConnectDialog.tsx") },
      { find: "next/navigation", replacement: bridge("next-navigation.tsx") },
      { find: "next/link", replacement: bridge("next-link.tsx") },
      { find: "next/image", replacement: bridge("next-image.tsx") },
      { find: "next/server", replacement: bridge("next-server.ts") },
      { find: "@", replacement: appSrc },
    ],
  },
  clearScreen: false,
  base: "./",
  server: {
    port: 1420,
    strictPort: true,
    open: false,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}));
