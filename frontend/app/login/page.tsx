"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { KeyRound, User, AlertCircle, Loader } from "lucide-react";
import tpsLogo from "@/public/logos/tps-logo-mono.png";
import resilienceLogo from "@/public/logos/resilience-logo-mono.png";
import { API, apiFetch } from "@/lib/api";
import { DEFAULT_PAGE } from "@/lib/permissions";


export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError("Username dan password wajib diisi.");
      return;
    }

    setError("");
    setSubmitting(true);

    try {
      const response = await apiFetch<{
        success: boolean;
        token: string;
        role: string;
        username: string;
        message?: string;
      }>(API.status().replace("/api/status", "/api/login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (response.success) {
        localStorage.setItem("token", response.token);
        localStorage.setItem("role", response.role);
        localStorage.setItem("username", response.username);
        const defaultPage = DEFAULT_PAGE[response.role] || "/live-monitoring";
        router.push(defaultPage);
      } else {
        setError(response.message || "Gagal masuk. Periksa kembali akun Anda.");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Username atau password salah.");
    } finally {
      setSubmitting(false);
    }
  };

  const tpsWidth = Math.round((44 * tpsLogo.width) / tpsLogo.height);
  const resilienceWidth = Math.round((44 * resilienceLogo.width) / resilienceLogo.height);

  return (
    <div className="login-container">
      {/* Logos Container */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        width: "100%",
        maxWidth: "420px",
        marginBottom: "28px",
        background: "rgba(255, 255, 255, 0.08)",
        padding: "16px 20px",
        borderRadius: "12px",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        border: "1px solid rgba(255, 255, 255, 0.1)"
      }}>
        <Image src={tpsLogo} alt="TPS Logo" width={tpsWidth} height={44} priority />
        <div style={{ width: "1px", height: "30px", background: "rgba(255, 255, 255, 0.2)" }} />
        <Image src={resilienceLogo} alt="Resilience Logo" width={resilienceWidth} height={44} priority />
      </div>

      {/* Login Card */}
      <div className="login-card">
        <div style={{ marginBottom: "28px" }}>
          <h2 className="login-title" style={{ color: "var(--color-text-primary)" }}>
            Operations Portal
          </h2>
          <p style={{ fontSize: "13.5px", color: "var(--color-text-secondary)", marginTop: "4px" }}>
            Silakan masuk dengan akun TPS Anda
          </p>
        </div>

        {error && (
          <div style={{
            background: "#FEF2F2",
            border: "1px solid #FCA5A5",
            borderRadius: "8px",
            padding: "12px 14px",
            display: "flex",
            alignItems: "center",
            gap: "10px",
            color: "#991B1B",
            fontSize: "13px",
            fontWeight: 500,
            marginBottom: "20px"
          }}>
            <AlertCircle size={16} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {/* Username Input */}
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label style={{ fontSize: "11px", fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Username / Email
            </label>
            <div style={{ position: "relative" }}>
              <User size={16} style={{
                position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)",
                color: "#9CA3AF"
              }} />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Masukkan username..."
                disabled={submitting}
                className="login-input"
              />
            </div>
          </div>

          {/* Password Input */}
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label style={{ fontSize: "11px", fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Password
            </label>
            <div style={{ position: "relative" }}>
              <KeyRound size={16} style={{
                position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)",
                color: "#9CA3AF"
              }} />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                disabled={submitting}
                className="login-input"
              />
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={submitting}
            className="login-btn"
          >
            {submitting ? (
              <>
                <Loader size={16} style={{ animation: "spin 1s linear infinite" }} />
                <span>Memproses...</span>
              </>
            ) : "Masuk"}
          </button>
        </form>

        <div style={{
          textAlign: "center", fontSize: "11.5px", color: "#9CA3AF",
          marginTop: "32px", borderTop: "1px solid #F3F4F6", paddingTop: "16px"
        }}>
          PPE Detection System v1.0.0<br />
          PT Terminal Petikemas Surabaya
        </div>
      </div>
    </div>
  );
}
