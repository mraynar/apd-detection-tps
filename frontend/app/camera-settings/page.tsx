"use client";

import { useState, useEffect, useCallback } from "react";
import PageShell from "@/components/PageShell";
import { API, apiFetch } from "@/lib/api";
import {
  Camera, CheckCircle, XCircle, Loader, AlertCircle,
  Wifi, RefreshCw, Monitor, Radio, Info, ExternalLink, Copy, Check
} from "lucide-react";

// ---- Types ----
interface LocalCamera {
  type: "local";
  index: number;
  label: string;
  available: boolean;
  unavailable_reason: string | null;
}

interface RtspCamera {
  id: string;
  label: string;
  rtsp_url: string;
  last_test_status: string | null;
}

interface CamerasResponse {
  local_cameras: LocalCamera[];
  rtsp_cameras: RtspCamera[];
  os: string;
}

interface CameraSettings {
  use_rtsp: boolean;
  rtsp_url: string;
  camera_index: number;
  selected_camera_id: string;
  connection_status: string;
}

interface TestResult {
  success: boolean;
  connection_status: string;
  latency_ms: number | null;
  message: string;
}

type BannerState = "idle" | "testing" | "connected" | "disconnected" | "no_frame" | "error" | "saving";

// ---- Helpers ----
function bannerClass(state: BannerState): string {
  return {
    idle: "",
    testing: "testing",
    saving: "testing",
    connected: "connected",
    disconnected: "disconnected",
    no_frame: "disconnected",
    error: "disconnected",
  }[state];
}

function bannerTitle(state: BannerState): string {
  return {
    idle: "",
    testing: "Menguji koneksi…",
    saving: "Menerapkan pengaturan…",
    connected: "Kamera terhubung",
    disconnected: "Gagal terhubung",
    no_frame: "Terhubung tapi tidak ada frame",
    error: "Error koneksi",
  }[state];
}

export default function CameraSettingsPage() {
  const [mounted, setMounted] = useState(false);
  const [settings, setSettings] = useState<CameraSettings | null>(null);
  const [cameras, setCameras] = useState<CamerasResponse | null>(null);
  const [useRtsp, setUseRtsp] = useState(false);
  const [rtspUrl, setRtspUrl] = useState("");
  const [camIndex, setCamIndex] = useState(0);
  const [banner, setBanner] = useState<BannerState>("idle");
  const [bannerMsg, setBannerMsg] = useState("");
  const [latency, setLatency] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshingCameras, setRefreshingCameras] = useState(false);
  const [copied, setCopied] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);
  const [testSuccess, setTestSuccess] = useState(false);
  const [lastTestedUrl, setLastTestedUrl] = useState("");

  const loadCameras = useCallback(async (silent = false) => {
    if (!silent) setRefreshingCameras(true);
    try {
      const c = await apiFetch<CamerasResponse>(API.cameras());
      setCameras(c);
    } catch {
      // Silently ignore — backend may be loading
    } finally {
      setRefreshingCameras(false);
    }
  }, []);

  const loadSettings = useCallback(async () => {
    try {
      const s = await apiFetch<CameraSettings>(API.cameraSettings());
      setSettings(s);
      setUseRtsp(s.use_rtsp);
      setRtspUrl(s.rtsp_url);
      setCamIndex(s.camera_index);
      setBanner(s.connection_status === "connected" ? "connected" : "disconnected");
      setBannerMsg(
        s.connection_status === "connected"
          ? "Kamera aktif terhubung."
          : "Kamera tidak terhubung saat ini."
      );
    } catch {
      setBanner("error");
      setBannerMsg(
        "Tidak dapat menjangkau backend. Pastikan backend/app.py berjalan di port 5001."
      );
    } finally {
      setLoading(false);
    }
  }, []);



  useEffect(() => {
    setMounted(true);
    loadSettings();
    loadCameras(true);
  }, [loadSettings, loadCameras]);

  // ---- Handlers ----
  const handleRefreshCameras = () => loadCameras(false);

  const handleCopy = () => {
    if (!rtspUrl) return;
    navigator.clipboard.writeText(rtspUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSelectCamera = async (val: string) => {
    let nextUseRtsp = false;
    let nextRtspUrl = rtspUrl;
    let nextCamIndex = camIndex;

    if (val.startsWith("rtsp_")) {
      nextUseRtsp = true;
      const matchedRtsp = rtspCameras.find((r) => `rtsp_${r.rtsp_url}` === val);
      if (matchedRtsp) {
        nextRtspUrl = matchedRtsp.rtsp_url;
        setRtspUrl(matchedRtsp.rtsp_url);
      }
      setUseRtsp(true);
      // Let the user click Connect manually to apply RTSP
      return;
    } else if (val.startsWith("local_")) {
      nextUseRtsp = false;
      const idx = parseInt(val.replace("local_", ""), 10);
      nextCamIndex = idx;
      setUseRtsp(false);
      setCamIndex(idx);
    }

    setBanner("saving");
    setBannerMsg("Mengaktifkan kamera lokal baru...");

    try {
      const result = await apiFetch<{ success: boolean; message: string; connection_status: string }>(
        API.cameraSettings(),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ use_rtsp: nextUseRtsp, rtsp_url: nextRtspUrl, camera_index: nextCamIndex }),
        }
      );
      setBanner(result.success ? "connected" : "disconnected");
      setBannerMsg(result.message);
      if (result.success) {
        setPreviewKey((prev) => prev + 1);
      }
      await loadSettings();
    } catch (err: unknown) {
      setBanner("error");
      setBannerMsg("Gagal mengubah kamera: " + (err instanceof Error ? err.message : String(err)));
      await loadSettings();
    }
  };

  const handleRtsptoggle = async (connect: boolean) => {
    setBanner("saving");
    setBannerMsg(connect ? "Menghubungkan ke RTSP..." : "Memutus koneksi RTSP...");

    try {
      const result = await apiFetch<{ success: boolean; message: string; connection_status: string }>(
        API.cameraSettings(),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            use_rtsp: connect,
            rtsp_url: rtspUrl,
            camera_index: camIndex
          }),
        }
      );
      setBanner(result.success ? "connected" : "disconnected");
      setBannerMsg(result.message);
      if (result.success) {
        setUseRtsp(connect);
        setPreviewKey((prev) => prev + 1);
      }
      await loadSettings();
    } catch (err: unknown) {
      setBanner("error");
      setBannerMsg("Gagal merubah state: " + (err instanceof Error ? err.message : String(err)));
      await loadSettings();
    }
  };

  const handleTest = async () => {
    setBanner("testing");
    setBannerMsg("Menguji koneksi, harap tunggu…");
    setLatency(null);
    try {
      const result = await apiFetch<TestResult>(API.cameraTest(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ use_rtsp: useRtsp, rtsp_url: rtspUrl, camera_index: camIndex }),
      });
      setBanner(result.connection_status as BannerState);
      setBannerMsg(result.message);
      setLatency(result.latency_ms);
      if (result.success && result.connection_status === "connected") {
        setTestSuccess(true);
        setLastTestedUrl(rtspUrl);
      } else {
        setTestSuccess(false);
      }
    } catch (err: unknown) {
      setBanner("error");
      setBannerMsg("Error: " + (err instanceof Error ? err.message : String(err)));
      setTestSuccess(false);
    }
  };

  // ---- Derived state ----
  const isSpinning = banner === "testing" || banner === "saving";
  const BannerIcon = isSpinning ? Loader : banner === "connected" ? CheckCircle : XCircle;

  const localCameras = cameras?.local_cameras ?? [];
  const rtspCameras = cameras?.rtsp_cameras ?? [];
  const detectedOS = cameras?.os ?? "Unknown";
  const availableLocals = localCameras.filter((c) => c.available);
  const unavailableLocals = localCameras.filter((c) => !c.available);

  // ---- Render ----
  if (loading) {
    return (
      <PageShell title="Camera & RTSP Settings" subtitle="TPS Petikemas Surabaya">
        <div
          style={{ padding: "48px", textAlign: "center", color: "var(--color-text-secondary)" }}
        >
          <Loader
            size={24}
            style={{ animation: "spin 1s linear infinite", marginBottom: 12 }}
          />
          <p>Memuat pengaturan kamera…</p>
        </div>
        <style jsx global>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </PageShell>
    );
  }

  return (
    <PageShell title="Camera & RTSP Settings" subtitle="TPS Petikemas Surabaya">
      {/* ===== TWO-COLUMN LAYOUT ===== */}
      <div style={{ display: "flex", gap: "16px", alignItems: "flex-start" }}>

        {/* ===== LEFT: Full-size Camera Preview ===== */}
        <div style={{ flex: "1 1 58%", minWidth: 0 }}>
          <div className="card" style={{ height: "100%" }}>
            <div className="card-header">
              <span className="card-title" style={{ display: "flex", alignItems: "center", gap: "7px" }}>
                <Camera size={15} style={{ color: "var(--color-primary)" }} />
                Camera Preview
              </span>
              {/* Active source badge — shows current mode */}
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "11.5px", fontWeight: 600, color: "var(--color-text-secondary)" }}>
                  {settings?.use_rtsp ? "CCTV RTSP Stream" : "Local Webcam / USB"}
                </span>
                <span className={`badge ${banner === "connected" ? "badge-live" : "badge-offline"}`} style={{ fontSize: "11px" }}>
                  <span className="dot" />
                  {banner === "connected" ? "Terhubung" : "Offline"}
                </span>
              </div>
            </div>
            <div className="card-body" style={{ padding: 0 }}>
              {/* Live Preview — full width, no aspect-ratio constraint so it fills card */}
              <div
                style={{
                  background: "#000",
                  borderRadius: "0 0 var(--radius-md) var(--radius-md)",
                  overflow: "hidden",
                  position: "relative",
                  minHeight: "340px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {mounted ? (
                  <img
                    src={`${API.videoFeed()}&_t=${previewKey}`}
                    alt="Preview kamera aktif"
                    style={{ width: "100%", display: "block", maxHeight: "520px", objectFit: "contain" }}
                  />
                ) : (
                  <div style={{ color: "rgba(255,255,255,0.5)", fontSize: "14px", padding: "40px" }}>
                    Memuat Aliran Video...
                  </div>
                )}
                {/* Overlay label */}
                <div
                  style={{
                    position: "absolute",
                    bottom: 10,
                    left: 10,
                    background: "rgba(0,0,0,0.7)",
                    color: "white",
                    fontSize: 11,
                    padding: "4px 10px",
                    borderRadius: 5,
                    backdropFilter: "blur(4px)",
                    WebkitBackdropFilter: "blur(4px)",
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                  }}
                >
                  <span style={{
                    width: 6, height: 6, borderRadius: "50%",
                    background: banner === "connected" ? "#22c55e" : "#ef4444",
                    display: "inline-block"
                  }} />
                  {settings?.use_rtsp ? `RTSP — ${settings.rtsp_url || "—"}` : `Webcam Index ${settings?.camera_index ?? 0}`}
                </div>
              </div>
            </div>

            {/* Connection status banner — shown inside preview card, below video */}
            {banner !== "idle" && (
              <div
                className={`connection-banner ${bannerClass(banner)}`}
                style={{ margin: "20px 16px 20px", borderRadius: "var(--radius-sm)" }}
              >
                <BannerIcon
                  size={16}
                  style={{
                    flexShrink: 0,
                    animation: isSpinning ? "spin 1s linear infinite" : undefined,
                  }}
                />
                <div>
                  <div style={{ fontWeight: 600, fontSize: "13px" }}>{bannerTitle(banner)}</div>
                  <div style={{ fontSize: "12px", marginTop: 2, opacity: 0.85 }}>
                    {bannerMsg}
                    {latency !== null && ` (latensi: ${latency} ms)`}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ===== RIGHT: Settings Panel ===== */}
        <div style={{ flex: "0 0 340px", display: "flex", flexDirection: "column", gap: "12px", marginTop: "52px" }}>

          {/* Camera Selection */}
          <div className="card">
            <div className="card-header">
              <span className="card-title" style={{ fontSize: "13px" }}>Pemilihan Kamera</span>
              <button
                className="btn btn-ghost btn-sm"
                onClick={handleRefreshCameras}
                disabled={refreshingCameras}
                title="Refresh daftar kamera"
                style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "11.5px", padding: "4px 8px" }}
              >
                <RefreshCw
                  size={12}
                  style={{ animation: refreshingCameras ? "spin 1s linear infinite" : undefined }}
                />
                {refreshingCameras ? "Memindai…" : "Refresh"}
              </button>
            </div>
            <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {/* OS indicator */}
              <div style={{ fontSize: 11.5, color: "var(--color-text-muted)", display: "flex", alignItems: "center", gap: 4 }}>
                <Monitor size={11} />
                OS: <strong style={{ color: "var(--color-text-secondary)" }}>{detectedOS}</strong>
                {detectedOS === "Windows" && <span>· CAP_DSHOW</span>}
                {detectedOS === "Darwin" && <span>· AVFoundation</span>}
              </div>

              <select
                className="form-select"
                value={useRtsp ? `rtsp_${rtspUrl}` : `local_${camIndex}`}
                onChange={(e) => handleSelectCamera(e.target.value)}
              >
                <optgroup label="── Kamera Lokal ──">
                  {availableLocals.length === 0 && unavailableLocals.length === 0 ? (
                    <option disabled value="">(Sedang memindai kamera…)</option>
                  ) : null}
                  {availableLocals.map((cam) => (
                    <option key={`local_${cam.index}`} value={`local_${cam.index}`}>{cam.label}</option>
                  ))}
                  {unavailableLocals.map((cam) => (
                    <option key={`local_${cam.index}`} value={`local_${cam.index}`} disabled>
                      ⚠ {cam.label} — Tidak dapat diakses
                    </option>
                  ))}
                </optgroup>
                {rtspCameras.length > 0 && (
                  <optgroup label="── RTSP Tersimpan ──">
                    {rtspCameras.map((cam) => (
                      <option key={cam.id} value={`rtsp_${cam.rtsp_url}`}>{cam.label}</option>
                    ))}
                  </optgroup>
                )}
              </select>

              {unavailableLocals.length > 0 && (
                <div className="alert alert-warning" style={{ fontSize: "11.5px", gap: 6 }}>
                  <Info size={13} style={{ flexShrink: 0 }} />
                  <div>
                    <strong>{unavailableLocals.length} kamera tidak dapat diakses.</strong>
                    <ul style={{ margin: "3px 0 0 14px", lineHeight: 1.6 }}>
                      {unavailableLocals.map((cam) => (
                        <li key={cam.index}><strong>Index {cam.index}:</strong> {cam.unavailable_reason}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* RTSP Configuration */}
          <div className="card">
            <div className="card-header">
              <span className="card-title" style={{ fontSize: "13px" }}>Konfigurasi RTSP</span>
              <Radio size={14} style={{ color: useRtsp ? "var(--color-primary)" : "var(--color-text-muted)" }} />
            </div>
            <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {/* RTSP Toggle */}
              <div>
                <label className="form-label" style={{ marginBottom: 6 }}>Mode RTSP</label>
                <div className="toggle-wrapper">
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={useRtsp}
                      onChange={(e) => setUseRtsp(e.target.checked)}
                    />
                    <span className="toggle-slider" />
                  </label>
                  <span className="toggle-label" style={{ fontSize: "12.5px" }}>
                    {useRtsp ? (
                      <><Radio size={13} style={{ display: "inline", marginRight: 4 }} />RTSP aktif (CCTV IP Camera)</>
                    ) : (
                      <><Monitor size={13} style={{ display: "inline", marginRight: 4 }} />Webcam / USB lokal</>
                    )}
                  </span>
                </div>
              </div>

              {/* RTSP URL */}
              <div>
                <label className="form-label" style={{ marginBottom: 4 }}>
                  Alamat RTSP
                  {!useRtsp && (
                    <span style={{ marginLeft: 6, fontSize: "10px", fontWeight: 400, color: "var(--color-text-muted)", textTransform: "none" }}>
                      (aktifkan RTSP untuk mengedit)
                    </span>
                  )}
                </label>
                <input
                  className="form-input"
                  type="text"
                  placeholder="rtsp://username:password@ip:port/stream"
                  value={rtspUrl}
                  onChange={(e) => {
                    const val = e.target.value;
                    setRtspUrl(val);
                    if (val !== lastTestedUrl) setTestSuccess(false);
                  }}
                  disabled={!useRtsp}
                  style={{ fontFamily: "monospace", fontSize: 12 }}
                />
                {useRtsp && (
                  <div style={{ fontSize: "11px", color: "var(--color-text-muted)", marginTop: 4 }}>
                    ⚠️ Alamat RTSP TPS belum dikonfirmasi IT. Test Koneksi timeout 6 detik.
                  </div>
                )}
              </div>

              {/* Parsed IP */}
              {useRtsp && (
                <div>
                  <label className="form-label" style={{ fontSize: "10.5px", color: "var(--color-text-secondary)", marginBottom: 4 }}>
                    Parsed IP Address
                  </label>
                  <input
                    className="form-input"
                    type="text"
                    readOnly
                    value={(() => {
                      try {
                        const match = rtspUrl.match(/rtsp:\/\/(?:[^@\n]+@)?([^:\/\n]+)/im);
                        return match ? `IP: ${match[1]}` : "IP: —";
                      } catch { return "IP: —"; }
                    })()}
                    style={{
                      background: "var(--color-border-light)",
                      fontFamily: "monospace", fontSize: "12px",
                      fontWeight: 600, color: "var(--color-text-secondary)"
                    }}
                  />
                </div>
              )}

              {/* Action Buttons */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", gap: 8 }}>
                  {useRtsp ? (
                    settings?.use_rtsp && rtspUrl === settings?.rtsp_url ? (
                      <button
                        className="btn btn-danger"
                        style={{ flex: 1 }}
                        onClick={() => handleRtsptoggle(false)}
                        disabled={isSpinning}
                      >
                        Disconnect RTSP
                      </button>
                    ) : (
                      <button
                        className="btn btn-primary"
                        style={{ flex: 1 }}
                        onClick={() => handleRtsptoggle(true)}
                        disabled={isSpinning || !testSuccess}
                        title={!testSuccess ? "Lakukan 'Test Koneksi' terlebih dahulu" : "Terapkan aliran RTSP"}
                      >
                        {!testSuccess ? "Uji Dulu" : "Hubungkan RTSP"}
                      </button>
                    )
                  ) : (
                    <button className="btn btn-outline" style={{ flex: 1 }} disabled>
                      Kamera Lokal Aktif
                    </button>
                  )}
                  <button className="btn btn-outline" onClick={handleTest} disabled={isSpinning} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <Wifi size={14} /> Test
                  </button>
                </div>

                {/* VLC / Copy buttons */}
                {useRtsp && rtspUrl && (
                  <div style={{ display: "flex", gap: 6 }}>
                    <a
                      href={rtspUrl}
                      className="btn btn-ghost btn-sm"
                      style={{ flex: 1, justifyContent: "center", fontSize: "11.5px" }}
                      title="Buka di VLC Media Player"
                    >
                      <ExternalLink size={13} /> VLC
                    </a>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={handleCopy}
                      style={{ flex: 1, justifyContent: "center", fontSize: "11.5px" }}
                    >
                      {copied ? <Check size={13} style={{ color: "var(--color-success)" }} /> : <Copy size={13} />}
                      {copied ? "Tersalin!" : "Salin URL"}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Quick Config Summary */}
          <div className="card">
            <div className="card-header">
              <span className="card-title" style={{ fontSize: "13px" }}>Status Konfigurasi</span>
            </div>
            <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {([
                ["Mode Aktif", settings?.use_rtsp ? "RTSP (CCTV)" : "Webcam / USB"],
                ["Indeks Kamera", String(settings?.camera_index ?? 0)],
                ["Status Koneksi", settings?.connection_status ?? "—"],
                ["Camera ID", settings?.selected_camera_id ?? "—"],
              ] as [string, string][]).map(([label, value]) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "12.5px" }}>
                  <span style={{ color: "var(--color-text-muted)" }}>{label}</span>
                  <span style={{ fontWeight: 600, color: "var(--color-text-primary)" }}>{value}</span>
                </div>
              ))}
            </div>
          </div>

        </div>
        {/* END RIGHT COLUMN */}

      </div>
      {/* END TWO-COLUMN */}

      <style jsx global>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </PageShell>
  );
}
