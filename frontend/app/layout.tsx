import type { Metadata } from "next";
import "./globals.css";
import AppShell from "@/components/AppShell";

export const metadata: Metadata = {
  title: "APD Detection System — TPS Petikemas Surabaya",
  description: "Sistem deteksi otomatis kepatuhan APD di area pelabuhan TPS Surabaya.",
};

/**
 * Root Layout — Server Component (no "use client").
 *
 * Route protection is handled by middleware.ts (checks session_token cookie).
 * Conditional rendering (sidebar vs. no sidebar for /login) is handled by
 * AppShell (Client Component) which uses usePathname().
 *
 * Previously this was a Client Component with localStorage auth-check,
 * which caused Safari blank pages because:
 *  - SSR sent an empty <body /> (authorized=false initial state)
 *  - Safari's JavaScriptCore hydrated slower than Chrome
 *  - Result: blank white screen until hydration, or permanently if hydration failed
 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
