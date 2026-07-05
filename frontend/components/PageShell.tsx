"use client";

import { useEffect, useState } from "react";

interface PageShellProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}

export default function PageShell({ title, subtitle, children, actions }: PageShellProps) {
  const [avatarInitial, setAvatarInitial] = useState("?");

  useEffect(() => {
    const username = localStorage.getItem("username") || "";
    setAvatarInitial(username.charAt(0).toUpperCase() || "?");
  }, []);

  return (
    <>
      <div className="page-topbar">
        <div className="page-topbar-left">
          <h1>{title}</h1>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <div className="page-topbar-right">
          {actions}
          <div className="avatar" title="User aktif">{avatarInitial}</div>
        </div>
      </div>
      <div className="page-content">
        {children}
      </div>
    </>
  );
}
