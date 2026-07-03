"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Monitor, Camera, AlertTriangle, BarChart2, LogOut } from "lucide-react";
import { API, apiFetch } from "@/lib/api";
import { ROLE_PAGES } from "@/lib/permissions";

const NAV_ITEMS = [
  {
    href: "/live-monitoring",
    label: "Live Monitoring",
    Icon: Monitor,
  },
  {
    href: "/camera-settings",
    label: "Camera & RTSP Settings",
    Icon: Camera,
  },
  {
    href: "/violation-history",
    label: "Violation History",
    Icon: AlertTriangle,
  },
  {
    href: "/analytics",
    label: "Analytics",
    Icon: BarChart2,
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [role, setRole] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);

  useEffect(() => {
    setRole(localStorage.getItem("role"));
    setUsername(localStorage.getItem("username"));
  }, []);

  const handleLogout = async () => {
    try {
      await apiFetch(API.logout(), {
        method: "POST"
      });
    } catch {
      // Ignore logout API failures
    } finally {
      localStorage.removeItem("token");
      localStorage.removeItem("role");
      localStorage.removeItem("username");
      // Explicitly delete role cookie on logout
      document.cookie = "user_role=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC;";
      router.push("/login");
    }
  };

  const userRole = role || "user";
  const visibleItems = NAV_ITEMS.filter(item =>
    ROLE_PAGES[userRole]?.includes(item.href)
  );

  return (
    <nav className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-title">Operations Center</div>
        <div className="sidebar-subtitle">Terminal Resilience</div>
      </div>

      {username && (
        <div style={{
          padding: "6px 12px",
          display: "flex",
          alignItems: "center",
          gap: "8px",
          background: "rgba(255, 255, 255, 0.08)",
          borderRadius: "8px",
          margin: "4px 0 12px",
        }}>
          <div style={{
            width: "24px",
            height: "24px",
            borderRadius: "50%",
            background: "rgba(255,255,255,0.2)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "11px",
            fontWeight: 700,
            color: "white"
          }}>
            {username.charAt(0).toUpperCase()}
          </div>
          <div>
            <div style={{ fontSize: "12px", fontWeight: 600, color: "white" }}>{username}</div>
            <div style={{ fontSize: "10px", color: "rgba(255, 255, 255, 0.4)", textTransform: "capitalize" }}>{userRole}</div>
          </div>
        </div>
      )}

      <div className="sidebar-section-label">Navigation</div>

      {visibleItems.map(({ href, label, Icon }) => {
        const isActive = pathname === href || pathname.startsWith(href + "/");
        return (
          <Link
            key={href}
            href={href}
            className={`nav-item ${isActive ? "active" : ""}`}
          >
            <Icon className="nav-icon" size={18} />
            {label}
          </Link>
        );
      })}

      {/* Footer */}
      <div style={{ flex: 1 }} />

      <button
        className="nav-item"
        onClick={handleLogout}
        style={{
          borderTop: "1px solid rgba(255,255,255,0.08)",
          paddingTop: "14px",
          borderRadius: 0,
          color: "rgba(255, 255, 255, 0.5)",
          marginBottom: "12px"
        }}
      >
        <LogOut className="nav-icon" size={18} />
        Sign Out
      </button>

      <div style={{
        padding: "12px",
        borderTop: "1px solid rgba(255,255,255,0.08)",
      }}>
        <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.3)", lineHeight: 1.6 }}>
          PPE Detection System<br />
          YOLOv8-OBB · v1.0.0<br />
          <span style={{ color: "rgba(255,255,255,0.2)" }}>
            Model accuracy may vary at distance / low-light
          </span>
        </div>
      </div>
    </nav>
  );
}
