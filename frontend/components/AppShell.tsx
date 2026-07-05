"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import Image from "next/image";
import Sidebar from "@/components/Sidebar";
import tpsLogo from "@/public/logos/tps-logo-mono.png";
import resilienceLogo from "@/public/logos/resilience-logo-mono.png";

/**
 * AppShell — Client Component responsible for conditional layout rendering.
 *
 * Auth protection is handled entirely by Next.js middleware (middleware.ts),
 * which checks the session_token cookie. This component does NOT duplicate
 * that check — doing so caused Safari blank pages because:
 *  1. SSR renders layout with authorized=false → sends blank <body/> to browser
 *  2. Safari's JavaScriptCore hydrates slower than Chrome's V8
 *  3. User sees blank screen until hydration completes
 *
 * The `mounted` guard prevents SSR-to-client hydration mismatch:
 * Before mount, we render children only (safe for both /login and app routes).
 * After mount, usePathname is reliable and we conditionally show the shell.
 */
export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Before hydration: render only children — no sidebar, no brand bar.
  // This prevents SSR mismatch and works for ALL routes because:
  // - /login page: has its own full-page background, children is self-contained
  // - app routes: middleware already blocked unauthenticated users server-side,
  //   so a brief content flash before sidebar appears is acceptable (ms range)
  if (!mounted) {
    return <>{children}</>;
  }

  // Login page: render children only (no sidebar/header)
  if (pathname === "/login") {
    return <>{children}</>;
  }

  const tpsWidth = Math.round((36 * tpsLogo.width) / tpsLogo.height);
  const resilienceWidth = Math.round((36 * resilienceLogo.width) / resilienceLogo.height);

  return (
    <div className="app-shell">
      {/* ===== BRAND BAR (top strip, full width, appears on ALL pages) ===== */}
      <header className="brand-bar">
        <div className="brand-bar-left">
          <Image
            src={tpsLogo}
            alt="Terminal Petikemas Surabaya Logo"
            width={tpsWidth}
            height={36}
            priority
          />
        </div>
        <div className="brand-bar-right">
          <Image
            src={resilienceLogo}
            alt="Resilience Operations Center Logo"
            width={resilienceWidth}
            height={36}
            priority
          />
        </div>
      </header>

      {/* ===== MAIN BODY (sidebar + content) ===== */}
      <div className="app-body">
        <Sidebar />
        <main className="content-area">{children}</main>
      </div>
    </div>
  );
}
