"use client";

import { useState, useCallback, useEffect } from "react";
import PageShell from "@/components/PageShell";
import { useInterval } from "@/hooks/useInterval";
import { API, apiFetch } from "@/lib/api";
import {
  Activity, AlertTriangle, Eye, PauseCircle, PlayCircle,
  Download, Wifi, WifiOff, Cpu, Radio, Shield
} from "lucide-react";


interface StatusData {
  fps: number;
  total_detected: number;
  violations: number;
  network_latency_ms: number | null;
  model_load_pct: number | null;
  is_detecting: boolean;
  stream_active: boolean;
}

interface Detection {
  label: string;
  confidence: number;
  is_violation: boolean;
  timestamp: string;
}

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return "--:--:--";
  }
}

export default function LiveMonitoringPage() {
  const [status, setStatus] = useState<StatusData | null>(null);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [streamError, setStreamError] = useState(false);
  const [isDetecting, setIsDetecting] = useState(true);
  const [backendReachable, setBackendReachable] = useState<boolean | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const data = await apiFetch<StatusData>(API.status());
      setStatus(data);
      setIsDetecting(data.is_detecting);
      setBackendReachable(true);
    } catch {
      setBackendReachable(false);
    }
  }, []);

  const fetchDetections = useCallback(async () => {
    try {
      const data = await apiFetch<Detection[]>(API.detectionsLive());
      setDetections(data);
    } catch {
      // silently ignore — status poll already flags unreachable
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchStatus();
    fetchDetections();
  }, [fetchStatus, fetchDetections]);

  // 1-second polling
  useInterval(fetchStatus, 1000);
  useInterval(fetchDetections, 1000);

  const toggleDetection = async () => {
    try {
      const data = await apiFetch<{ is_detecting: boolean }>(API.detectionToggle(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_detecting: !isDetecting }),
      });
      setIsDetecting(data.is_detecting);
    } catch {
      alert("Gagal toggle deteksi — pastikan backend berjalan.");
    }
  };

  const exportSnapshot = async () => {
    const url = API.videoFeed();
    window.open(url, "_blank");
  };

  // Helmet calculations
  const helmetDetections = detections.filter(
    (d) => d.label === "helmet" || d.label === "head"
  );
  const totalHelmets = helmetDetections.length;
  const compliantHelmets = helmetDetections.filter((d) => d.label === "helmet").length;
  const helmetRate = totalHelmets > 0 ? Math.round((compliantHelmets / totalHelmets) * 100) : null;

  // Vest calculations
  const vestDetections = detections.filter(
    (d) => d.label === "Safety Vest" || d.label === "NO-Safety Vest"
  );
  const totalVests = vestDetections.length;
  const compliantVests = vestDetections.filter((d) => d.label === "Safety Vest").length;
  const vestRate = totalVests > 0 ? Math.round((compliantVests / totalVests) * 100) : null;

  const streamActive = backendReachable && !streamError;


  return (
    <PageShell
      title="Live Monitoring"
      subtitle="TPS Petikemas Surabaya"
    >
      <div className="monitoring-layout">
        {/* ===== LEFT: VIDEO + MINI CARDS ===== */}
        <div className="monitoring-left">
          {/* Video Feed Card */}
          <div className="card" style={{ flex: "1 1 auto" }}>
            <div className="card-header">
              <div className="flex items-center gap-2">
                <Radio size={15} style={{ color: "var(--color-text-secondary)" }} />
                <span className="card-title" style={{ fontSize: "13px" }}>
                  MAIN GATE TERMINAL A — CAM 04
                </span>
              </div>
              <div>
                {streamActive ? (
                  <span className="badge badge-live">
                    <span className="dot" /> LIVE STREAM
                  </span>
                ) : (
                  <span className="badge badge-offline">
                    <span className="dot" /> OFFLINE
                  </span>
                )}
              </div>
            </div>
            <div style={{
              background: "#000",
              position: "relative",
              minHeight: "360px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}>
              {backendReachable === false ? (
                <div style={{ textAlign: "center", color: "rgba(255,255,255,0.5)", padding: "40px" }}>
                  <WifiOff size={40} style={{ marginBottom: "12px", opacity: 0.4 }} />
                  <p style={{ fontSize: "14px", marginBottom: "6px" }}>Backend tidak dapat dijangkau</p>
                  <p style={{ fontSize: "12px", opacity: 0.6 }}>Jalankan: <code>python app.py</code> di folder backend/</p>
                </div>
              ) : (
                <img
                  src={API.videoFeed()}
                  alt="Live MJPEG stream dari kamera aktif"
                  style={{ width: "100%", display: "block", maxHeight: "500px", objectFit: "contain" }}
                  onError={() => setStreamError(true)}
                  onLoad={() => setStreamError(false)}
                />
              )}
              {/* Overlay: detection paused indicator */}
              {!isDetecting && backendReachable && (
                <div style={{
                  position: "absolute",
                  top: "12px",
                  left: "12px",
                  background: "rgba(245,158,11,0.9)",
                  color: "white",
                  padding: "4px 10px",
                  borderRadius: "6px",
                  fontSize: "12px",
                  fontWeight: 700,
                }}>
                  ⏸ DETEKSI DIJEDA
                </div>
              )}
            </div>
          </div>

          {/* Mini metric cards: Helmet + Vest Compliance */}
          <div className="grid-2">
            <div className="stat-card">
              <div className="stat-card-label" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <Shield size={13} style={{ color: "var(--color-primary)" }} />
                Helmet Detection
              </div>
              <div className="stat-card-value" style={{ fontSize: "20px", marginTop: "6px" }}>
                {helmetRate !== null ? (
                  <span className={helmetRate === 100 ? "text-success" : "text-danger"} style={{ fontWeight: 800 }}>
                    {helmetRate}% Kepatuhan
                  </span>
                ) : (
                  <span style={{ fontSize: "14px", color: "var(--color-text-muted)", fontWeight: 500 }}>
                    Tidak Terdeteksi
                  </span>
                )}
              </div>
              <div className="text-sm text-muted mt-1">
                {totalHelmets > 0
                  ? `Terdeteksi: ${compliantHelmets}/${totalHelmets} Helm`
                  : "Nol target di frame ini"}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-card-label" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <Shield size={13} style={{ color: "var(--color-primary)" }} />
                Safety Vest Detection
              </div>
              <div className="stat-card-value" style={{ fontSize: "20px", marginTop: "6px" }}>
                {vestRate !== null ? (
                  <span className={vestRate === 100 ? "text-success" : "text-danger"} style={{ fontWeight: 800 }}>
                    {vestRate}% Kepatuhan
                  </span>
                ) : (
                  <span style={{ fontSize: "14px", color: "var(--color-text-muted)", fontWeight: 500 }}>
                    Tidak Terdeteksi
                  </span>
                )}
              </div>
              <div className="text-sm text-muted mt-1">
                {totalVests > 0
                  ? `Terdeteksi: ${compliantVests}/${totalVests} Rompi`
                  : "Nol target di frame ini"}
              </div>
            </div>
          </div>
        </div>


        {/* ===== RIGHT: STATUS + DETECTIONS + QUICK ACTIONS ===== */}
        <div className="monitoring-right">
          {/* Real-time Status */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">Real-time Status</span>
              <Activity size={15} style={{ color: "var(--color-primary)" }} />
            </div>
            <div className="card-body" style={{ padding: "12px 20px" }}>
              <div className="metric-row">
                <span className="metric-label">FPS</span>
                <span className="metric-value-chip chip-blue">
                  {status ? status.fps : "—"}
                </span>
              </div>
              <div className="metric-row">
                <span className="metric-label">Total Terdeteksi</span>
                <span className="metric-value-chip chip-gray">
                  {status ? status.total_detected : "—"}
                </span>
              </div>
              <div className="metric-row">
                <span className="metric-label">Pelanggaran</span>
                <span className="metric-value-chip chip-red">
                  {status ? status.violations : "—"}
                </span>
              </div>
              <div className="metric-row">
                <span className="metric-label">Status Deteksi</span>
                {status ? (
                  <span className={`badge ${status.is_detecting ? "badge-safe" : "badge-warning"}`}>
                    {status.is_detecting ? "Aktif" : "Dijeda"}
                  </span>
                ) : (
                  <span className="badge badge-neutral">—</span>
                )}
              </div>
              <div className="metric-row">
                <span className="metric-label">Backend</span>
                {backendReachable === null ? (
                  <span className="badge badge-neutral">Menghubungkan…</span>
                ) : backendReachable ? (
                  <span className="badge badge-live"><span className="dot" />Online</span>
                ) : (
                  <span className="badge badge-offline"><span className="dot" />Offline</span>
                )}
              </div>
            </div>
          </div>

          {/* Live Detection Feed */}
          <div className="card" style={{ flex: "1 1 auto" }}>
            <div className="card-header">
              <span className="card-title">Live Detection Feed</span>
              <Eye size={15} style={{ color: "var(--color-text-secondary)" }} />
            </div>
            <div className="card-body" style={{ padding: "8px 20px", maxHeight: "280px", overflowY: "auto" }}>
              {detections.length === 0 ? (
                <div className="empty-state" style={{ padding: "24px" }}>
                  <div className="empty-state-icon"><Eye size={28} /></div>
                  <p style={{ fontSize: "12px" }}>Tidak ada deteksi pada frame ini</p>
                </div>
              ) : (
                detections.map((d, i) => (
                  <div key={i} className="detection-item">
                    <div>
                      <div className="detection-label">{d.label}</div>
                      <div className="detection-time">{formatTime(d.timestamp)}</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--color-text-secondary)" }}>
                        {Math.round(d.confidence * 100)}%
                      </span>
                      <span className={`badge ${d.is_violation ? "badge-violation" : "badge-safe"}`}>
                        {d.is_violation ? (
                          <><AlertTriangle size={10} /> Pelanggaran</>
                        ) : "Patuh"}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">Quick Actions</span>
            </div>
            <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <button
                className={`btn w-full ${isDetecting ? "btn-outline" : "btn-primary"}`}
                onClick={toggleDetection}
                disabled={backendReachable === false}
              >
                {isDetecting ? (
                  <><PauseCircle size={15} /> Pause Detection</>
                ) : (
                  <><PlayCircle size={15} /> Resume Detection</>
                )}
              </button>
              <button
                className="btn btn-ghost w-full"
                onClick={exportSnapshot}
                disabled={backendReachable === false}
              >
                <Download size={15} /> Export Snapshot
              </button>
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
