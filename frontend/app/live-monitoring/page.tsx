"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import PageShell from "@/components/PageShell";
import { useInterval } from "@/hooks/useInterval";
import { API, apiFetch } from "@/lib/api";
import {
  Activity, AlertTriangle, Eye, PauseCircle, PlayCircle,
  Download, WifiOff, Radio, Shield, Loader
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

interface ActiveSettings {
  use_rtsp: boolean;
  rtsp_url: string;
  camera_index: number;
  selected_camera_id: string;
  connection_status: string;
  source_type?: string;
}

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return "--:--:--";
  }
}

export default function LiveMonitoringPage() {
  const [mounted, setMounted] = useState(false);
  const [status, setStatus] = useState<StatusData | null>(null);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [streamError, setStreamError] = useState(false);
  const [isDetecting, setIsDetecting] = useState(true);
  const [backendReachable, setBackendReachable] = useState<boolean | null>(null);
  const [toggleError, setToggleError] = useState("");

  // Camera Settings state
  const [settings, setSettings] = useState<ActiveSettings | null>(null);
  const [myCameras, setMyCameras] = useState<any[]>([]);
  const [activeCamera, setActiveCamera] = useState<any>(null);

  // Client-side webcam refs
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const uploadIntervalRef = useRef<any>(null);
  const isUploadingRef = useRef<boolean>(false);

  const fetchStatus = useCallback(async () => {
    try {
      const url = activeCamera?.id ? `${API.status()}?camera_id=${activeCamera.id}` : API.status();
      const data = await apiFetch<StatusData>(url);
      setStatus(data);
      setIsDetecting(data.is_detecting);
      setBackendReachable(true);
    } catch {
      setBackendReachable(false);
    }
  }, [activeCamera]);

  const fetchDetections = useCallback(async () => {
    try {
      const url = activeCamera?.id ? `${API.detectionsLive()}?camera_id=${activeCamera.id}` : API.detectionsLive();
      const data = await apiFetch<Detection[]>(url);
      setDetections(data);
    } catch {
      // silently ignore
    }
  }, [activeCamera]);

  const loadSettingsAndCameras = useCallback(async () => {
    try {
      const s = await apiFetch<ActiveSettings>(API.cameraSettings());
      setSettings(s);

      const role = localStorage.getItem("role");
      const url = role === "admin" ? `${API.myCameras()}?all=true` : API.myCameras();
      const list = await apiFetch<any[]>(url);
      setMyCameras(list);

      // Find active camera matching settings
      let active = null;
      if (s.selected_camera_id) {
        if (s.selected_camera_id.startsWith("rtsp_")) {
          const cid = parseInt(s.selected_camera_id.split("rtsp_")[1], 10);
          active = list.find((c) => c.id === cid);
        } else if (s.selected_camera_id.startsWith("webcam_")) {
          const cid = parseInt(s.selected_camera_id.split("webcam_")[1], 10);
          active = list.find((c) => c.id === cid);
        }
      }
      // Fallback to legacy matching if selected_camera_id has no DB id suffix
      if (!active) {
        if (s.use_rtsp) {
          active = list.find((c) => c.source_type === "rtsp" && c.rtsp_url === s.rtsp_url);
        } else {
          active = list.find((c) => c.source_type === "webcam");
        }
      }
      setActiveCamera(active);
    } catch (err) {
      console.error("Failed to load active settings or cameras:", err);
    }
  }, []);

  // Initial load (runs only once on mount to avoid infinite fetch cycles)
  useEffect(() => {
    setMounted(true);
    loadSettingsAndCameras();
  }, [loadSettingsAndCameras]);

  // Initial stats/detections trigger when active camera is resolved
  useEffect(() => {
    if (activeCamera) {
      fetchStatus();
      fetchDetections();
    }
  }, [activeCamera, fetchStatus, fetchDetections]);

  // 1-second polling for server state
  useInterval(fetchStatus, 1000);
  useInterval(fetchDetections, 1000);

  // Setup / teardown browser webcam capture
  useEffect(() => {
    const isWebcam = activeCamera ? activeCamera.source_type === "webcam" : (settings && !settings.use_rtsp);

    if (isWebcam && activeCamera) {
      // Start browser getUserMedia capture
      const startWebcam = async () => {
        try {
          if (streamRef.current) {
            streamRef.current.getTracks().forEach((t) => t.stop());
          }

          const constraints = activeCamera.webcam_device_id
            ? { video: { deviceId: { exact: activeCamera.webcam_device_id }, width: 1280, height: 720 } }
            : { video: { width: 1280, height: 720 } };

          const stream = await navigator.mediaDevices.getUserMedia(constraints);
          streamRef.current = stream;

          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }

          // Start uploading frames periodically (every 400ms to reduce CPU/request backlog)
          if (uploadIntervalRef.current) {
            clearInterval(uploadIntervalRef.current);
          }
          uploadIntervalRef.current = setInterval(uploadFrame, 400);
        } catch (err) {
          console.error("Gagal memulai tangkapan webcam client-side:", err);
        }
      };

      startWebcam();
    } else {
      // Stop browser webcam capture
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (uploadIntervalRef.current) {
        clearInterval(uploadIntervalRef.current);
        uploadIntervalRef.current = null;
      }
      // Clear overlay canvas
      if (canvasRef.current) {
        const ctx = canvasRef.current.getContext("2d");
        ctx?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
    }

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (uploadIntervalRef.current) {
        clearInterval(uploadIntervalRef.current);
        uploadIntervalRef.current = null;
      }
    };
  }, [settings, activeCamera]);

  const uploadFrame = async () => {
    if (isUploadingRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.paused || video.ended) return;

    // Create an offscreen canvas to capture JPEG blob
    const offscreen = document.createElement("canvas");
    offscreen.width = video.videoWidth || 1280;
    offscreen.height = video.videoHeight || 720;
    const oCtx = offscreen.getContext("2d");
    if (!oCtx) return;

    oCtx.drawImage(video, 0, 0, offscreen.width, offscreen.height);

    isUploadingRef.current = true;
    offscreen.toBlob(async (blob) => {
      if (!blob) {
        isUploadingRef.current = false;
        return;
      }

      const formData = new FormData();
      formData.append("image", blob, "webcam_frame.jpg");
      if (activeCamera?.id) {
        formData.append("camera_id", String(activeCamera.id));
      }

      try {
        const result = await apiFetch<any>(`${API.videoFeed().split("/video_feed")[0]}/api/detect-frame`, {
          method: "POST",
          body: formData,
        });

        if (result.success) {
          // Immediately update detections & stats on client side for responsive feedback
          const transformed = result.detections.map((d: any) => ({
            label: d.label,
            confidence: d.confidence,
            is_violation: d.violation || d.is_violation,
            timestamp: new Date().toISOString(),
          }));
          setDetections(transformed);

          setStatus((prev) =>
            prev
              ? {
                  ...prev,
                  total_detected: result.detections.length,
                  violations: result.violations_count,
                  stream_active: true,
                }
              : null
          );

          // Draw oriented bounding boxes on overlaid canvas
          drawOverlays(result.detections);
        }
      } catch (err) {
        console.error("Gagal mengunggah frame:", err);
      } finally {
        isUploadingRef.current = false;
      }
    }, "image/jpeg", 0.85);
  };

  const drawOverlays = (detections: any[]) => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set canvas internal dimensions to match the actual stream frame size
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;

    // Clear previous drawing
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    detections.forEach((d) => {
      if (!d.box_points) return;
      const points = d.box_points; // [[x1, y1], [x2, y2], [x3, y3], [x4, y4]]
      const isViolation = d.violation || d.is_violation;

      ctx.beginPath();
      ctx.moveTo(points[0][0], points[0][1]);
      for (let j = 1; j < points.length; j++) {
        ctx.lineTo(points[j][0], points[j][1]);
      }
      ctx.closePath();

      ctx.strokeStyle = isViolation ? "#ef4444" : "#22c55e";
      ctx.lineWidth = 3;
      ctx.stroke();

      // Label text background
      ctx.fillStyle = isViolation ? "#ef4444" : "#22c55e";
      ctx.font = "bold 16px sans-serif";
      const text = `${d.label} (${Math.round(d.confidence * 100)}%)`;
      const textWidth = ctx.measureText(text).width;
      ctx.fillRect(points[0][0], points[0][1] - 26, textWidth + 10, 26);

      // Label text
      ctx.fillStyle = "#ffffff";
      ctx.fillText(text, points[0][0] + 5, points[0][1] - 8);
    });
  };

  const toggleDetection = async () => {
    setToggleError("");
    try {
      const data = await apiFetch<{ is_detecting: boolean }>(API.detectionToggle(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_detecting: !isDetecting }),
      });
      setIsDetecting(data.is_detecting);
    } catch {
      setToggleError("Gagal toggle deteksi — pastikan backend berjalan.");
      setTimeout(() => setToggleError(""), 4000);
    }
  };

  const exportSnapshot = async () => {
    const isRtsp = activeCamera ? activeCamera.source_type === "rtsp" : settings?.use_rtsp;
    if (isRtsp) {
      const url = activeCamera
        ? `${API.videoFeed().split("/video_feed")[0]}/video_feed/${activeCamera.id}?token=${encodeURIComponent(localStorage.getItem("token") || "")}`
        : API.videoFeed();
      window.open(url, "_blank");
    } else {
      // Local webcam snapshot from canvas
      const video = videoRef.current;
      if (!video) return;
      const snapshotCanvas = document.createElement("canvas");
      snapshotCanvas.width = video.videoWidth || 1280;
      snapshotCanvas.height = video.videoHeight || 720;
      const sCtx = snapshotCanvas.getContext("2d");
      if (sCtx) {
        sCtx.drawImage(video, 0, 0, snapshotCanvas.width, snapshotCanvas.height);
        // Convert to download link
        const dataUrl = snapshotCanvas.toDataURL("image/jpeg");
        const link = document.createElement("a");
        link.download = `webcam_snapshot_${new Date().toISOString()}.jpg`;
        link.href = dataUrl;
        link.click();
      }
    }
  };

  // Helmet calculations
  const helmetDetections = detections.filter(
    (d) => d.label === "helmet" || d.label === "head" || d.label === "chinstrap_helmet" || d.label === "chinstrap_no-helmet"
  );
  const compliantHelmets = helmetDetections.filter((d) => d.label === "helmet" || d.label === "chinstrap_helmet").length;
  const violationHelmets = helmetDetections.filter((d) => d.label === "head" || d.label === "chinstrap_no-helmet").length;

  // Vest calculations
  const vestDetections = detections.filter(
    (d) => d.label === "Safety Vest" || d.label === "NO-Safety Vest"
  );
  const compliantVests = vestDetections.filter((d) => d.label === "Safety Vest").length;
  const violationVests = vestDetections.filter((d) => d.label === "NO-Safety Vest").length;

  const hasHelmetData = helmetDetections.length > 0;
  const hasVestData = vestDetections.length > 0;

  const isRtspActive = activeCamera ? activeCamera.source_type === "rtsp" : settings?.use_rtsp;
  const streamActive = backendReachable && (status?.stream_active || (activeCamera && activeCamera.source_type === "webcam"));

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
                  {activeCamera ? activeCamera.label.toUpperCase() : "NO CAMERA SELECTED"}
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
              overflow: "hidden",
            }}>
              {backendReachable === false ? (
                <div style={{ textAlign: "center", color: "rgba(255,255,255,0.5)", padding: "40px" }}>
                  <WifiOff size={40} style={{ marginBottom: "12px", opacity: 0.4 }} />
                  <p style={{ fontSize: "14px", marginBottom: "6px" }}>Backend tidak dapat dijangkau</p>
                  <p style={{ fontSize: "12px", opacity: 0.6 }}>Jalankan: <code>python app.py</code> di folder backend/</p>
                </div>
              ) : mounted ? (
                isRtspActive ? (
                  <img
                    src={activeCamera 
                      ? `${API.videoFeed().split("/video_feed")[0]}/video_feed/${activeCamera.id}?token=${encodeURIComponent(localStorage.getItem("token") || "")}`
                      : API.videoFeed()}
                    alt="Live MJPEG stream dari kamera aktif"
                    style={{ width: "100%", display: "block", maxHeight: "500px", objectFit: "contain" }}
                    onError={() => setStreamError(true)}
                    onLoad={() => setStreamError(false)}
                  />
                ) : (
                  <div style={{ position: "relative", width: "100%", display: "flex", justifyContent: "center", alignItems: "center" }}>
                    <video
                      ref={videoRef}
                      autoPlay
                      muted
                      playsInline
                      style={{ width: "100%", display: "block", maxHeight: "500px", objectFit: "contain" }}
                    />
                    <canvas
                      ref={canvasRef}
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        height: "100%",
                        pointerEvents: "none",
                        objectFit: "contain",
                      }}
                    />
                  </div>
                )
              ) : (
                <div style={{ textAlign: "center", color: "rgba(255,255,255,0.5)", padding: "40px" }}>
                  <p style={{ fontSize: "14px", marginBottom: "6px" }}>Memuat Aliran Video...</p>
                </div>
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
                  zIndex: 2,
                }}>
                  ⏸ DETEKSI DIJEDA
                </div>
              )}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {toggleError && (
              <div className="alert alert-danger" style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px" }}>
                <AlertTriangle size={14} /> {toggleError}
              </div>
            )}
            <div className="grid-2">
              {/* Helmet Detection Card */}
              <div className="stat-card">
                <div className="stat-card-label" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <Shield size={13} style={{ color: "var(--color-primary)" }} />
                  Helmet Detection
                </div>
                {hasHelmetData ? (
                  <div style={{ display: "flex", gap: "8px", marginTop: "10px" }}>
                    <div style={{
                      flex: 1, textAlign: "center",
                      padding: "10px 8px",
                      background: "var(--color-success-dim)",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid rgba(22,163,74,0.15)",
                    }}>
                      <div style={{ fontSize: "26px", fontWeight: 800, color: "var(--color-success)", lineHeight: 1 }}>
                        {compliantHelmets}
                      </div>
                      <div style={{ fontSize: "10px", fontWeight: 600, color: "var(--color-success)", marginTop: "4px", textTransform: "uppercase", letterSpacing: "0.4px" }}>
                        Patuh
                      </div>
                    </div>
                    <div style={{
                      flex: 1, textAlign: "center",
                      padding: "10px 8px",
                      background: "var(--color-danger-dim)",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid rgba(220,38,38,0.15)",
                    }}>
                      <div style={{ fontSize: "26px", fontWeight: 800, color: "var(--color-danger)", lineHeight: 1 }}>
                        {violationHelmets}
                      </div>
                      <div style={{ fontSize: "10px", fontWeight: 600, color: "var(--color-danger)", marginTop: "4px", textTransform: "uppercase", letterSpacing: "0.4px" }}>
                        Pelanggaran
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: "13px", color: "var(--color-text-muted)", fontWeight: 500, marginTop: "10px", fontStyle: "italic" }}>
                    Tidak ada deteksi
                  </div>
                )}
              </div>

              {/* Safety Vest Detection Card */}
              <div className="stat-card">
                <div className="stat-card-label" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <Shield size={13} style={{ color: "var(--color-primary)" }} />
                  Safety Vest Detection
                </div>
                {hasVestData ? (
                  <div style={{ display: "flex", gap: "8px", marginTop: "10px" }}>
                    <div style={{
                      flex: 1, textAlign: "center",
                      padding: "10px 8px",
                      background: "var(--color-success-dim)",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid rgba(22,163,74,0.15)",
                    }}>
                      <div style={{ fontSize: "26px", fontWeight: 800, color: "var(--color-success)", lineHeight: 1 }}>
                        {compliantVests}
                      </div>
                      <div style={{ fontSize: "10px", fontWeight: 600, color: "var(--color-success)", marginTop: "4px", textTransform: "uppercase", letterSpacing: "0.4px" }}>
                        Patuh
                      </div>
                    </div>
                    <div style={{
                      flex: 1, textAlign: "center",
                      padding: "10px 8px",
                      background: "var(--color-danger-dim)",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid rgba(220,38,38,0.15)",
                    }}>
                      <div style={{ fontSize: "26px", fontWeight: 800, color: "var(--color-danger)", lineHeight: 1 }}>
                        {violationVests}
                      </div>
                      <div style={{ fontSize: "10px", fontWeight: 600, color: "var(--color-danger)", marginTop: "4px", textTransform: "uppercase", letterSpacing: "0.4px" }}>
                        Pelanggaran
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: "13px", color: "var(--color-text-muted)", fontWeight: 500, marginTop: "10px", fontStyle: "italic" }}>
                    Tidak ada deteksi
                  </div>
                )}
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
                  {status ? (isRtspActive ? status.fps : "Client-side") : "—"}
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
