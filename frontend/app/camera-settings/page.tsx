"use client";

import { useState, useEffect, useCallback } from "react";
import PageShell from "@/components/PageShell";
import { API, apiFetch } from "@/lib/api";
import {
  Camera, CheckCircle, XCircle, Loader, AlertCircle, Save,
  Wifi, RefreshCw, Monitor, Radio, Info, ExternalLink, Copy, Check, Shield
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

  // ---- User Management State ----
  const [users, setUsers] = useState<{ id: number; username: string; role: string; created_at: string }[]>([]);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState("user");
  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [editRole, setEditRole] = useState("user");
  const [editPassword, setEditPassword] = useState("");
  const [userError, setUserError] = useState("");
  const [userSuccess, setUserSuccess] = useState("");
  const [loadingUsers, setLoadingUsers] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const data = await apiFetch<any[]>(API.users());
      setUsers(data);
    } catch (err: any) {
      setUserError("Gagal memuat daftar user.");
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setUserError("");
    setUserSuccess("");
    if (!newUsername.trim() || !newPassword.trim() || !newRole) {
      setUserError("Semua field wajib diisi.");
      return;
    }
    try {
      await apiFetch(API.users(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: newUsername, password: newPassword, role: newRole }),
      });
      setUserSuccess("User berhasil dibuat.");
      setNewUsername("");
      setNewPassword("");
      setNewRole("user");
      fetchUsers();
    } catch (err: any) {
      setUserError(err.message || "Gagal membuat user.");
    }
  };

  const handleDeleteUser = async (id: number) => {
    if (!confirm("Apakah Anda yakin ingin menghapus user ini?")) return;
    setUserError("");
    setUserSuccess("");
    try {
      await apiFetch(API.usersDetail(id), {
        method: "DELETE",
      });
      setUserSuccess("User berhasil dihapus.");
      fetchUsers();
    } catch (err: any) {
      setUserError(err.message || "Gagal menghapus user.");
    }
  };

  const handleUpdateUser = async (id: number) => {
    setUserError("");
    setUserSuccess("");
    try {
      const body: Record<string, string> = { role: editRole };
      if (editPassword.trim()) {
        body.password = editPassword;
      }
      await apiFetch(API.usersDetail(id), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setUserSuccess("User berhasil diperbarui.");
      setEditingUserId(null);
      setEditPassword("");
      fetchUsers();
    } catch (err: any) {
      setUserError(err.message || "Gagal memperbarui user.");
    }
  };

  useEffect(() => {
    loadSettings();
    loadCameras(true);
    fetchUsers();
  }, [loadSettings, loadCameras, fetchUsers]);

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
      <div style={{ maxWidth: 800, display: "flex", flexDirection: "column", gap: 16 }}>

        {/* ===== Live Preview + Source Form ===== */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Camera Source</span>
            <Camera size={15} style={{ color: "var(--color-primary)" }} />
          </div>
          <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 20 }}>

            {/* Live Preview Thumbnail */}
            <div
              style={{
                aspectRatio: "16/9",
                background: "#000",
                borderRadius: "var(--radius-sm)",
                overflow: "hidden",
                position: "relative",
              }}
            >
              <img
                src={`${API.videoFeed()}&_t=${previewKey}`}
                alt="Preview kamera aktif"
                style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
              />
              <div
                style={{
                  position: "absolute",
                  bottom: 8,
                  left: 8,
                  background: "rgba(0,0,0,0.65)",
                  color: "white",
                  fontSize: 11,
                  padding: "3px 8px",
                  borderRadius: 4,
                  backdropFilter: "blur(4px)",
                }}
              >
                Preview — kamera aktif
              </div>
            </div>

            {/* RTSP Support Status Widget */}
            <div style={{
              background: "var(--color-bg)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-sm)",
              padding: "14px 16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}>
              <div>
                <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  RTSP Support Status
                </div>
                <div style={{ fontSize: "13.5px", fontWeight: 700, color: "var(--color-text-primary)", marginTop: "2px" }}>
                  Active Source Mode: <span style={{ color: "var(--color-primary)" }}>{settings?.use_rtsp ? "CCTV RTSP Stream" : "Local Webcam / USB"}</span>
                </div>
              </div>
              <span className="badge badge-safe" style={{ fontSize: "10.5px", padding: "4px 10px" }}>
                RTSP Supported
              </span>
            </div>

            {/* ===== Camera Selection Dropdown + Refresh ===== */}
            <div className="form-group">
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 6,
                }}
              >
                <label className="form-label" style={{ margin: 0 }}>
                  Pemilihan Kamera
                </label>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={handleRefreshCameras}
                  disabled={refreshingCameras}
                  title="Refresh daftar kamera (berguna setelah USB dicolok atau permission baru diizinkan)"
                  style={{ display: "flex", alignItems: "center", gap: 5, fontSize: "12px" }}
                >
                  <RefreshCw
                    size={13}
                    style={{ animation: refreshingCameras ? "spin 1s linear infinite" : undefined }}
                  />
                  {refreshingCameras ? "Memindai…" : "Refresh Kamera"}
                </button>
              </div>

              {/* OS indicator */}
              <div
                style={{
                  fontSize: 11.5,
                  color: "var(--color-text-muted)",
                  marginBottom: 8,
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                }}
              >
                <Monitor size={12} />
                Terdeteksi OS: <strong style={{ color: "var(--color-text-secondary)" }}>{detectedOS}</strong>
                {detectedOS === "Windows" && (
                  <span style={{ color: "var(--color-text-muted)" }}>— menggunakan backend CAP_DSHOW</span>
                )}
                {detectedOS === "Darwin" && (
                  <span style={{ color: "var(--color-text-muted)" }}>— menggunakan AVFoundation</span>
                )}
              </div>

              {/* Dropdown with <optgroup> sections */}
              <select
                className="form-select"
                value={useRtsp ? `rtsp_${rtspUrl}` : `local_${camIndex}`}
                onChange={(e) => handleSelectCamera(e.target.value)}
              >
                {/* Local Cameras group */}
                <optgroup label="── Kamera Lokal ──">
                  {availableLocals.length === 0 && unavailableLocals.length === 0 ? (
                    <option disabled value="">
                      (Sedang memindai kamera…)
                    </option>
                  ) : null}
                  {availableLocals.map((cam) => (
                    <option key={`local_${cam.index}`} value={`local_${cam.index}`}>
                      {cam.label}
                    </option>
                  ))}
                  {unavailableLocals.map((cam) => (
                    <option
                      key={`local_${cam.index}`}
                      value={`local_${cam.index}`}
                      disabled
                    >
                      ⚠ {cam.label} — Tidak dapat diakses
                    </option>
                  ))}
                </optgroup>

                {/* RTSP Cameras group */}
                {rtspCameras.length > 0 && (
                  <optgroup label="── RTSP Tersimpan ──">
                    {rtspCameras.map((cam) => (
                      <option key={cam.id} value={`rtsp_${cam.rtsp_url}`}>
                        {cam.label}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>

              {/* Unavailable cameras info */}
              {unavailableLocals.length > 0 && (
                <div
                  className="alert alert-warning"
                  style={{ marginTop: 8, fontSize: "12px", gap: 8 }}
                >
                  <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                  <div>
                    <strong>{unavailableLocals.length} kamera terdeteksi tapi tidak dapat diakses:</strong>
                    <ul style={{ margin: "4px 0 0 16px", lineHeight: 1.7 }}>
                      {unavailableLocals.map((cam) => (
                        <li key={cam.index}>
                          <strong>Index {cam.index}:</strong> {cam.unavailable_reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>

            {/* Enable RTSP Toggle */}
            <div className="form-group">
              <label className="form-label">Mode RTSP</label>
              <div className="toggle-wrapper">
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={useRtsp}
                    onChange={(e) => setUseRtsp(e.target.checked)}
                  />
                  <span className="toggle-slider" />
                </label>
                <span className="toggle-label">
                  {useRtsp ? (
                    <><Radio size={14} style={{ display: "inline", marginRight: 5 }} />RTSP aktif (CCTV IP Camera)</>
                  ) : (
                    <><Monitor size={14} style={{ display: "inline", marginRight: 5 }} />Webcam / USB lokal</>
                  )}
                </span>
              </div>
            </div>

            {/* RTSP URL Input — disabled when RTSP is OFF */}
            <div className="form-group">
              <label className="form-label">
                Alamat RTSP
                {!useRtsp && (
                  <span
                    style={{
                      marginLeft: 8,
                      fontSize: "10px",
                      color: "var(--color-text-muted)",
                      fontWeight: 400,
                      textTransform: "none",
                      letterSpacing: 0,
                    }}
                  >
                    (aktifkan mode RTSP untuk mengedit)
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
                  if (val !== lastTestedUrl) {
                    setTestSuccess(false);
                  }
                }}
                disabled={!useRtsp}
                style={{ fontFamily: "monospace", fontSize: 13 }}
              />
              {useRtsp && (
                <div style={{ fontSize: "11.5px", color: "var(--color-text-muted)", marginTop: 4 }}>
                  ⚠️ Alamat RTSP CCTV TPS belum dikonfirmasi IT. Test Koneksi akan melakukan percobaan
                  nyata dengan timeout 6 detik — hasilnya ditampilkan apa adanya.
                </div>
              )}
            </div>

            {/* IP Kamera parser */}
            {useRtsp && (
              <div className="form-group" style={{ marginTop: "-8px" }}>
                <label className="form-label" style={{ fontSize: "11px", color: "var(--color-text-secondary)" }}>
                  Parsed IP Address
                </label>
                <input
                  className="form-input"
                  type="text"
                  readOnly
                  value={(() => {
                    try {
                      const match = rtspUrl.match(/rtsp:\/\/(?:[^@\n]+@)?([^:\/\n]+)/im);
                      return match ? `IP Kamera: ${match[1]}` : "IP Kamera: —";
                    } catch {
                      return "IP Kamera: —";
                    }
                  })()}
                  style={{
                    background: "var(--color-border-light)",
                    fontFamily: "monospace",
                    fontSize: "13px",
                    fontWeight: 600,
                    color: "var(--color-text-secondary)"
                  }}
                />
              </div>
            )}

            {/* Action Buttons */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", gap: 10 }}>
                {useRtsp ? (
                  settings?.use_rtsp && rtspUrl === settings?.rtsp_url ? (
                    <button
                      className="btn"
                      style={{ flex: 1, background: "var(--color-danger)", color: "white" }}
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
                      {!testSuccess ? "Hubungkan ke RTSP (Lakukan Uji Dulu)" : "Terapkan & Hubungkan RTSP"}
                    </button>
                  )
                ) : (
                  <button
                    className="btn btn-outline"
                    style={{ flex: 1 }}
                    disabled
                  >
                    Kamera Lokal Aktif
                  </button>
                )}
                <button className="btn btn-outline" onClick={handleTest} disabled={isSpinning}>
                  <Wifi size={15} /> Test Koneksi
                </button>
              </div>

              {/* VLC launcher and copy buttons when RTSP is selected */}
              {useRtsp && rtspUrl && (
                <div style={{
                  display: "flex",
                  gap: 10,
                  padding: "12px",
                  background: "var(--color-border-light)",
                  borderRadius: "var(--radius-sm)",
                  alignItems: "center",
                  justifyContent: "space-between"
                }}>
                  <a
                    href={rtspUrl}
                    className="btn btn-ghost btn-sm"
                    style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "12px", color: "var(--color-primary)", textDecoration: "underline" }}
                    title="Coba buka link RTSP di VLC Media Player (jika terinstall & protocol handler aktif)"
                  >
                    <ExternalLink size={14} /> Buka di VLC / Media Player
                  </a>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={handleCopy}
                    style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "12px" }}
                  >
                    {copied ? <Check size={14} style={{ color: "var(--color-success)" }} /> : <Copy size={14} />}
                    {copied ? "Tersalin!" : "Salin Alamat RTSP"}
                  </button>
                </div>
              )}
            </div>

            {/* Connection Status Banner — real result */}
            {banner !== "idle" && (
              <div className={`connection-banner ${bannerClass(banner)}`}>
                <BannerIcon
                  size={17}
                  style={{
                    flexShrink: 0,
                    animation: isSpinning ? "spin 1s linear infinite" : undefined,
                  }}
                />
                <div>
                  <div style={{ fontWeight: 600 }}>{bannerTitle(banner)}</div>
                  <div style={{ fontSize: "12.5px", marginTop: 2, opacity: 0.9 }}>
                    {bannerMsg}
                    {latency !== null && ` (latensi: ${latency} ms)`}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ===== Info / Config Card ===== */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Informasi Konfigurasi Aktif</span>
          </div>
          <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div
              style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 28px" }}
            >
              {([
                ["Mode Aktif", settings?.use_rtsp ? "RTSP (CCTV)" : "Webcam / USB"],
                ["Indeks Kamera Lokal", String(settings?.camera_index ?? 0)],
                ["Status Koneksi Backend", settings?.connection_status ?? "—"],
                ["Camera ID (internal)", settings?.selected_camera_id ?? "—"],
              ] as [string, string][]).map(([label, value]) => (
                <div key={label}>
                  <div className="text-sm text-muted">{label}</div>
                  <div style={{ fontSize: "13.5px", fontWeight: 600, marginTop: 2 }}>{value}</div>
                </div>
              ))}
            </div>

            <div className="divider" />

            {/* Cross-platform notes */}
            <div className="alert alert-info" style={{ fontSize: "12.5px" }}>
              <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
              <div>
                <strong>Catatan cross-platform:</strong> CAMERA_INDEX adalah urutan perangkat fisik
                yang dideteksi OS, BUKAN angka yang berbeda antar sistem operasi. Yang berbeda
                adalah <em>backend OpenCV</em> yang digunakan (CAP_DSHOW di Windows, AVFoundation di
                macOS). Klik <strong>Refresh Kamera</strong> setiap kali USB webcam baru dicolok atau
                permission kamera baru diizinkan.
              </div>
            </div>

            <div className="alert alert-warning" style={{ fontSize: "12.5px" }}>
              <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
              <div>
                <strong>macOS Continuity Camera:</strong> Jika iPhone berada dekat Mac, iPhone dapat
                otomatis muncul sebagai kamera dan mengubah urutan index kamera yang sudah ada. Jika
                daftar kamera terlihat tidak konsisten, nonaktifkan Continuity Camera di System
                Settings → General → AirPlay &amp; Handoff.
              </div>
            </div>
          </div>
        </div>

        {/* ===== User & Account Management Card (Admin Only) ===== */}
        <div className="card">
          <div className="card-header">
            <span className="card-title" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Shield size={16} style={{ color: "var(--color-primary)" }} />
              User & Account Management
            </span>
          </div>
          <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {userError && (
              <div className="alert alert-danger" style={{ fontSize: "13px" }}>
                <AlertCircle size={14} /> {userError}
              </div>
            )}
            {userSuccess && (
              <div className="alert alert-success" style={{ fontSize: "13px" }}>
                <CheckCircle size={14} /> {userSuccess}
              </div>
            )}

            {/* Create User Form */}
            <form onSubmit={handleCreateUser} style={{
              background: "var(--color-bg)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-sm)",
              padding: "16px",
              display: "flex",
              flexDirection: "column",
              gap: "12px"
            }}>
              <div style={{ fontWeight: 700, fontSize: "12px", color: "var(--color-text-secondary)", textTransform: "uppercase" }}>
                Tambah Akun Baru
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <label style={{ fontSize: "11px", fontWeight: 600, color: "var(--color-text-muted)" }}>Username</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Contoh: operator2"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    style={{ height: "36px" }}
                  />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <label style={{ fontSize: "11px", fontWeight: 600, color: "var(--color-text-muted)" }}>Password</label>
                  <input
                    type="password"
                    className="form-input"
                    placeholder="••••••••"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    style={{ height: "36px" }}
                  />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <label style={{ fontSize: "11px", fontWeight: 600, color: "var(--color-text-muted)" }}>Role</label>
                  <select
                    className="form-select"
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value)}
                    style={{ height: "36px" }}
                  >
                    <option value="user">User (Review & Analytics)</option>
                    <option value="admin">Admin (System Operations)</option>
                  </select>
                </div>
              </div>
              <button type="submit" className="btn btn-primary" style={{ alignSelf: "flex-end", height: "36px", padding: "0 16px" }}>
                Simpan User
              </button>
            </form>

            <div className="divider" />

            {/* Users List */}
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <div style={{ fontWeight: 700, fontSize: "12px", color: "var(--color-text-secondary)", textTransform: "uppercase" }}>
                Daftar Akun Terdaftar
              </div>
              {loadingUsers ? (
                <div style={{ textAlign: "center", padding: "20px" }}>
                  <Loader size={16} style={{ animation: "spin 1s linear infinite" }} />
                </div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                    <thead>
                      <tr style={{ borderBottom: "2px solid var(--color-border)", textAlign: "left" }}>
                        <th style={{ padding: "8px", color: "var(--color-text-muted)" }}>Username</th>
                        <th style={{ padding: "8px", color: "var(--color-text-muted)" }}>Role</th>
                        <th style={{ padding: "8px", color: "var(--color-text-muted)" }}>Dibuat Pada</th>
                        <th style={{ padding: "8px", color: "var(--color-text-muted)", textAlign: "right" }}>Aksi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((u) => {
                        const isEditing = editingUserId === u.id;
                        return (
                          <tr key={u.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                            <td style={{ padding: "8px", fontWeight: 600 }}>{u.username}</td>
                            <td style={{ padding: "8px" }}>
                              {isEditing ? (
                                <select
                                  className="form-select"
                                  value={editRole}
                                  onChange={(e) => setEditRole(e.target.value)}
                                  style={{ height: "30px", fontSize: "12px", padding: "0 8px" }}
                                >
                                  <option value="user">user</option>
                                  <option value="admin">admin</option>
                                </select>
                              ) : (
                                <span className={`badge ${u.role === "admin" ? "badge-warning" : "badge-safe"}`} style={{ fontSize: "11px" }}>
                                  {u.role}
                                </span>
                              )}
                            </td>
                            <td style={{ padding: "8px", color: "var(--color-text-muted)" }}>
                              {new Date(u.created_at).toLocaleDateString("id-ID", {
                                year: "numeric",
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit"
                              })}
                            </td>
                            <td style={{ padding: "8px", textAlign: "right" }}>
                              {isEditing ? (
                                <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", alignItems: "center" }}>
                                  <input
                                    type="password"
                                    className="form-input"
                                    placeholder="Reset pass (opsional)"
                                    value={editPassword}
                                    onChange={(e) => setEditPassword(e.target.value)}
                                    style={{ height: "30px", width: "140px", fontSize: "12px", padding: "0 8px" }}
                                  />
                                  <button
                                    className="btn btn-primary"
                                    onClick={() => handleUpdateUser(u.id)}
                                    style={{ height: "30px", fontSize: "12px", padding: "0 10px" }}
                                  >
                                    Simpan
                                  </button>
                                  <button
                                    className="btn btn-outline"
                                    onClick={() => setEditingUserId(null)}
                                    style={{ height: "30px", fontSize: "12px", padding: "0 10px" }}
                                  >
                                    Batal
                                  </button>
                                </div>
                              ) : (
                                <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                                  <button
                                    className="btn btn-outline"
                                    onClick={() => {
                                      setEditingUserId(u.id);
                                      setEditRole(u.role);
                                      setEditPassword("");
                                    }}
                                    style={{ height: "30px", fontSize: "12px", padding: "0 10px" }}
                                  >
                                    Edit
                                  </button>
                                  <button
                                    className="btn"
                                    onClick={() => handleDeleteUser(u.id)}
                                    style={{ height: "30px", fontSize: "12px", padding: "0 10px", background: "var(--color-danger)", color: "white" }}
                                  >
                                    Hapus
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      <style jsx global>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </PageShell>
  );
}
