"use client";

import { Shield, Globe } from "lucide-react";

interface PageShellProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}

export default function PageShell({ title, subtitle, children, actions }: PageShellProps) {
  return (
    <>
      <div className="page-topbar">
        <div className="page-topbar-left">
          <h1>{title}</h1>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <div className="page-topbar-right">
          {actions}
          <button className="topbar-icon-btn" title="Globe">
            <Globe size={16} />
          </button>
          <button className="topbar-icon-btn" title="Security">
            <Shield size={16} />
          </button>
          <div className="avatar" title="User">A</div>
        </div>
      </div>
      <div className="page-content">
        {children}
      </div>
    </>
  );
}
