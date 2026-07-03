"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import Image from "next/image";
import tpsLogo from "@/public/logos/tps-logo-mono.png";
import resilienceLogo from "@/public/logos/resilience-logo-mono.png";
import { isRouteAllowed, DEFAULT_PAGE } from "@/lib/permissions";


export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("token");
    const role = localStorage.getItem("role");

    if (pathname === "/login") {
      setAuthorized(true);
      return;
    }

    if (!token) {
      router.push("/login");
      setAuthorized(false);
    } else {
      const userRole = role || "user";
      if (!isRouteAllowed(userRole, pathname)) {
        const defaultPage = DEFAULT_PAGE[userRole] || "/live-monitoring";
        router.push(defaultPage);
      } else {
        setAuthorized(true);
      }
    }
  }, [pathname, router]);

  // Loading page to prevent layout flash during redirect
  if (!authorized) {
    return (
      <html lang="id">
        <head>
          <title>APD Detection System — Loading...</title>
        </head>
        <body style={{ background: "#F0F2F5", margin: 0 }} />
      </html>
    );
  }

  // Render pure login page layout
  if (pathname === "/login") {
    return (
      <html lang="id">
        <head>
          <title>Login — APD Detection System</title>
        </head>
        <body style={{ margin: 0 }}>
          {children}
        </body>
      </html>
    );
  }

  const tpsWidth = Math.round((36 * tpsLogo.width) / tpsLogo.height);
  const resilienceWidth = Math.round((36 * resilienceLogo.width) / resilienceLogo.height);

  return (
    <html lang="id">
      <head>
        <title>APD Detection System — TPS Petikemas Surabaya</title>
        <meta name="description" content="Sistem deteksi otomatis kepatuhan APD di area pelabuhan TPS Surabaya." />
      </head>
      <body>
        <div className="app-shell">
          {/* ===== BRAND BAR (top strip, full width, appears on ALL pages) ===== */}
          <header className="brand-bar">
            <div className="brand-bar-left">
              {/* TPS Logo (left) */}
              <Image
                src={tpsLogo}
                alt="Terminal Petikemas Surabaya Logo"
                width={tpsWidth}
                height={36}
                priority
              />
            </div>
            <div className="brand-bar-right">
              {/* Resilience Logo (right) */}
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
            <main className="content-area">
              {children}
            </main>
          </div>
        </div>
      </body>
    </html>
  );
}


