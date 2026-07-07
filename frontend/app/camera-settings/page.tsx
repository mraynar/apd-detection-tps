"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import PageShell from "@/components/PageShell";
import { API, apiFetch } from "@/lib/api";
import {
  Camera, CheckCircle, XCircle, Loader,
  Wifi, RefreshCw, Edit2, Play, Trash2, User
} from "lucide-react";

// ---- Types ----
interface LocalCamera {
  type: "local";
  index: number;
  label: string;
  available: boolean;
  unavailable_reason: string | null;
}

interface CamerasResponse {
  local_cameras: LocalCamera[];
  rtsp_cameras: any[];
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
  const [role, setRole] = useState<string | null>(null);
  const [settings, setSettings] = useState<CameraSettings | null>(null);
  const [cameras, setCameras] = useState<CamerasResponse | null>(null);
  const [banner, setBanner] = useState<BannerState>("idle");
  const [bannerMsg, setBannerMsg] = useState("");
  const [latency, setLatency] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshingCameras, setRefreshingCameras] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);
  const [testSuccess, setTestSuccess] = useState(false);
  const [lastTestedUrl, setLastTestedUrl] = useState("");

  // my-cameras management states
  const [myCameras, setMyCameras] = useState<any[]>([]);
  const [loadingMyCameras, setLoadingMyCameras] = useState(true);

  // Browser-local webcams state
  const [browserDevices, setBrowserDevices] = useState<MediaDeviceInfo[]>([]);

  // Form states for Add/Edit
  const [formLabel, setFormLabel] = useState("");
  const [formSourceType, setFormSourceType] = useState<"webcam" | "rtsp">("webcam");
  const [formRtspUrl, setFormRtspUrl] = useState("");
  const [formWebcamDeviceId, setFormWebcamDeviceId] = useState("");
  const [formCamIndex, setFormCamIndex] = useState(0);
  const [editingCamId, setEditingCamId] = useState<number | null>(null);

  // Local preview refs for browser webcam selection
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const previewStreamRef = useRef<MediaStream | null>(null);

  // Live preview effect for the selected browser webcam
  useEffect(() => {
    const isWebcam = formSourceType === "webcam";

    if (isWebcam && mounted) {
      const startPreview = async () => {
        try {
          if (previewStreamRef.current) {
            previewStreamRef.current.getTracks().forEach((track) => track.stop());
            previewStreamRef.current = null;
          }

          const constraints = formWebcamDeviceId
            ? { video: { deviceId: { exact: formWebcamDeviceId }, width: 1280, height: 720 } }
            : { video: { width: 1280, height: 720 } };

          const stream = await navigator.mediaDevices.getUserMedia(constraints);
          previewStreamRef.current = stream;
          if (previewVideoRef.current) {
            previewVideoRef.current.srcObject = stream;
          }
        } catch (err) {
          console.warn("Gagal membuka preview webcam lokal:", err);
        }
      };

      startPreview();
    } else {
      if (previewStreamRef.current) {
        previewStreamRef.current.getTracks().forEach((track) => track.stop());
        previewStreamRef.current = null;
      }
    }

    return () => {
      if (previewStreamRef.current) {
        previewStreamRef.current.getTracks().forEach((track) => track.stop());
        previewStreamRef.current = null;
      }
    };
  }, [formSourceType, formWebcamDeviceId, mounted]);

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

  const loadBrowserWebcams = useCallback(async () => {
    try {
      // Prompt user for camera permission to read labels
      await navigator.mediaDevices.getUserMedia({ video: true });
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter((d) => d.kind === "videoinput");
      setBrowserDevices(videoDevices);
      if (videoDevices.length > 0 && !formWebcamDeviceId) {
        setFormWebcamDeviceId(videoDevices[0].deviceId);
      }
    } catch (err) {
      console.warn("Failed to list browser webcams:", err);
    }
  }, [formWebcamDeviceId]);

  const loadSettings = useCallback(async () => {
    try {
      const s = await apiFetch<CameraSettings>(API.cameraSettings());
      setSettings(s);
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

  const loadMyCameras = useCallback(async () => {
    if (!role) return;
    setLoadingMyCameras(true);
    try {
      const url = role === "admin" ? `${API.myCameras()}?all=true` : API.myCameras();
      const list = await apiFetch<any[]>(url);
      setMyCameras(list);
    } catch (err) {
      console.error("Failed to fetch my-cameras:", err);
    } finally {
      setLoadingMyCameras(false);
    }
  }, [role]);

  useEffect(() => {
    setMounted(true);
    if (typeof window !== "undefined") {
      setRole(localStorage.getItem("role"));
    }
    loadSettings();
    loadCameras(true);
  }, [loadSettings, loadCameras]);

  useEffect(() => {
    if (role) {
      loadMyCameras();
    }
  }, [role, loadMyCameras]);

  useEffect(() => {
    if (mounted && formSourceType === "webcam") {
      loadBrowserWebcams();
    }
  }, [mounted, formSourceType, loadBrowserWebcams]);

  // ---- Handlers ----
  const handleRefreshCameras = () => loadCameras(false);

  const handleEditClick = (cam: any) => {
    setEditingCamId(cam.id);
    setFormLabel(cam.label);
    const resolvedType = cam.source_type || (cam.use_rtsp ? "rtsp" : "webcam");
    setFormSourceType(resolvedType);
    setFormRtspUrl(cam.rtsp_url || "");
    setFormWebcamDeviceId(cam.webcam_device_id || "");
    setFormCamIndex(0);
  };

  const handleResetForm = () => {
    setEditingCamId(null);
    setFormLabel("");
    setFormSourceType("webcam");
    setFormRtspUrl("");
    setFormWebcamDeviceId("");
    setFormCamIndex(0);
    setTestSuccess(false);
  };

  const handleSaveCamera = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formLabel.trim()) return;

    setBanner("saving");
    setBannerMsg(editingCamId ? "Memperbarui kamera..." : "Menambahkan kamera baru...");

    try {
      const payload = {
        label: formLabel.trim(),
        source_type: formSourceType,
        rtsp_url: formSourceType === "rtsp" ? formRtspUrl.trim() : null,
        webcam_device_id: formSourceType === "webcam" ? formWebcamDeviceId : null,
        camera_index: null, // Always keep NULL in database for both client webcam and rtsp
      };

      if (editingCamId) {
        await apiFetch(API.myCamerasDetail(editingCamId), {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch(API.myCameras(), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      setBanner("connected");
      setBannerMsg(editingCamId ? "Kamera berhasil diperbarui." : "Kamera berhasil ditambahkan.");
      handleResetForm();
      await loadMyCameras();
    } catch (err: any) {
      setBanner("error");
      setBannerMsg("Gagal menyimpan kamera: " + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handleDeleteCamera = async (id: number) => {
    if (!confirm("Apakah Anda yakin ingin menghapus kamera ini?")) return;
    try {
      await apiFetch(API.myCamerasDetail(id), { method: "DELETE" });
      await loadMyCameras();
    } catch (err: any) {
      alert("Gagal menghapus kamera: " + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handleConnectCamera = async (cam: any) => {
    setBanner("saving");
    setBannerMsg(`Menghubungkan ke ${cam.label}...`);

    try {
      // NOTE: camera_index=0 sent here is a dummy value — browser-based webcam mode doesn't 
      // use server-side device index at all. This only exists to safely release any server-held 
      // webcam handle from the old architecture.
      const result = await apiFetch<{ success: boolean; message: string; connection_status: string }>(
        API.cameraSettings(),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            use_rtsp: cam.source_type === "rtsp" || cam.use_rtsp,
            rtsp_url: cam.rtsp_url || "",
            camera_index: cam.source_type === "webcam" ? 0 : 1,
          }),
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
      setBannerMsg("Gagal menghubungkan kamera: " + (err instanceof Error ? err.message : String(err)));
      await loadSettings();
    }
  };

  const handleTestForm = async () => {
    setBanner("testing");
    setBannerMsg("Menguji koneksi, harap tunggu…");
    setLatency(null);

    if (formSourceType === "webcam") {
      // Client-side local device testing
      try {
        const constraints = formWebcamDeviceId 
          ? { video: { deviceId: { exact: formWebcamDeviceId } } }
          : { video: true };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        stream.getTracks().forEach((track) => track.stop()); // close the camera device immediately

        setBanner("connected");
        setBannerMsg("Kamera lokal berhasil diakses oleh browser.");
        setTestSuccess(true);
      } catch (err: any) {
        setBanner("error");
        setBannerMsg("Gagal mengakses webcam lokal: " + (err.message || String(err)));
        setTestSuccess(false);
      }
    } else {
      // RTSP backend test
      try {
        const result = await apiFetch<TestResult>(API.cameraTest(), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            use_rtsp: true,
            rtsp_url: formRtspUrl,
            camera_index: 0,
          }),
        });
        setBanner(result.connection_status as BannerState);
        setBannerMsg(result.message);
        setLatency(result.latency_ms);
        if (result.success && result.connection_status === "connected") {
          setTestSuccess(true);
          setLastTestedUrl(formRtspUrl);
        } else {
          setTestSuccess(false);
        }
      } catch (err: unknown) {
        setBanner("error");
        setBannerMsg("Error: " + (err instanceof Error ? err.message : String(err)));
        setTestSuccess(false);
      }
    }
  };

  const isSpinning = banner === "testing" || banner === "saving";
  const BannerIcon = isSpinning ? Loader : banner === "connected" ? CheckCircle : XCircle;

  if (loading) {
    return (
      <PageShell title="Camera & RTSP Settings" subtitle="TPS Petikemas Surabaya">
        <div style={{ padding: "48px", textAlign: "center", color: "var(--color-text-secondary)" }}>
          <Loader size={24} style={{ animation: "spin 1s linear infinite", marginBottom: 12 }} />
          <p>Memuat pengaturan kamera…</p>
        </div>
        <style jsx global>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </PageShell>
    );
  }

  return (
    <PageShell title="Camera & RTSP Settings" subtitle="TPS Petikemas Surabaya">
      <div style={{ display: "flex", gap: "16px", alignItems: "flex-start" }}>
        
        {/* ===== LEFT: Full-size Camera Preview ===== */}
        <div style={{ flex: "1 1 58%", minWidth: 0 }}>
          <div className="card" style={{ height: "100%" }}>
            <div className="card-header">
              <span className="card-title" style={{ display: "flex", alignItems: "center", gap: "7px" }}>
                <Camera size={15} style={{ color: "var(--color-primary)" }} />
                Camera Preview
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "11.5px", fontWeight: 600, color: "var(--color-text-secondary)" }}>
                  {formSourceType === "rtsp" ? "CCTV RTSP Stream" : "Local Webcam / USB"}
                </span>
                <span className={`badge ${formSourceType === "rtsp" ? (banner === "connected" ? "badge-live" : "badge-offline") : "badge-live"}`} style={{ fontSize: "11px" }}>
                  <span className="dot" style={{ background: formSourceType === "rtsp" ? (banner === "connected" ? "#22c55e" : "#ef4444") : "#3b82f6" }} />
                  {formSourceType === "rtsp" ? (banner === "connected" ? "Terhubung" : "Offline") : "Local Preview"}
                </span>
              </div>
            </div>
            <div className="card-body" style={{ padding: 0 }}>
              <div style={{
                background: "#000",
                borderRadius: "0 0 var(--radius-md) var(--radius-md)",
                overflow: "hidden",
                position: "relative",
                minHeight: "340px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}>
                {mounted ? (
                  formSourceType === "rtsp" ? (
                    <img
                      src={`${API.videoFeed()}&_t=${previewKey}`}
                      alt="Preview kamera aktif"
                      style={{ width: "100%", display: "block", maxHeight: "520px", objectFit: "contain" }}
                    />
                  ) : (
                    <video
                      ref={previewVideoRef}
                      autoPlay
                      muted
                      playsInline
                      style={{ width: "100%", display: "block", maxHeight: "520px", objectFit: "contain" }}
                    />
                  )
                ) : (
                  <div style={{ color: "rgba(255,255,255,0.5)", fontSize: "14px", padding: "40px" }}>
                    Memuat Aliran Video...
                  </div>
                )}
                <div style={{
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
                }}>
                  <span style={{
                    width: 6, height: 6, borderRadius: "50%",
                    background: formSourceType === "rtsp" ? (banner === "connected" ? "#22c55e" : "#ef4444") : "#3b82f6",
                    display: "inline-block"
                  }} />
                  {formSourceType === "rtsp" ? `RTSP — ${formRtspUrl || "—"}` : `Live Local Preview`}
                </div>
              </div>
            </div>

            {banner !== "idle" && (
              <div className={`connection-banner ${bannerClass(banner)}`} style={{ margin: "20px 16px 20px", borderRadius: "var(--radius-sm)" }}>
                <BannerIcon size={16} style={{ flexShrink: 0, animation: isSpinning ? "spin 1s linear infinite" : undefined }} />
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
        <div style={{ flex: "0 0 340px", display: "flex", flexDirection: "column", gap: "12px" }}>
          
          {/* CAMERA LIST */}
          <div className="card">
            <div className="card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span className="card-title" style={{ fontSize: "13px" }}>
                {role === "admin" ? "Semua Kamera User" : "Daftar Kamera Saya"}
              </span>
              <button
                className="btn btn-ghost btn-sm"
                onClick={loadMyCameras}
                disabled={loadingMyCameras}
                style={{ display: "flex", alignItems: "center", gap: 4, padding: "2px 6px", height: "auto" }}
              >
                <RefreshCw size={12} style={{ animation: loadingMyCameras ? "spin 1s linear infinite" : undefined }} />
              </button>
            </div>
            <div className="card-body" style={{ padding: "12px", display: "flex", flexDirection: "column", gap: "8px" }}>
              {loadingMyCameras && myCameras.length === 0 ? (
                <div style={{ textAlign: "center", padding: "12px", color: "var(--color-text-muted)" }}>
                  <Loader size={16} style={{ animation: "spin 1s linear infinite", display: "inline-block" }} />
                </div>
              ) : myCameras.length === 0 ? (
                <div style={{ textAlign: "center", padding: "12px", color: "var(--color-text-muted)", fontSize: "12px" }}>
                  Belum ada kamera terdaftar.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "250px", overflowY: "auto" }}>
                  {myCameras.map((cam) => {
                    const isCamRtsp = cam.source_type === "rtsp" || cam.use_rtsp;
                    const isActive = settings 
                      ? (settings.use_rtsp === isCamRtsp && 
                         (isCamRtsp ? settings.rtsp_url === cam.rtsp_url : !settings.use_rtsp))
                      : false;

                    return (
                      <div
                        key={cam.id}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "8px 10px",
                          borderRadius: "var(--radius-sm)",
                          background: isActive ? "var(--color-primary-dim)" : "var(--color-bg-alt, #f8f9fa)",
                          border: isActive ? "1px solid var(--color-primary)" : "1px solid var(--color-border-light, #e9ecef)",
                        }}
                      >
                        <div style={{ minWidth: 0, flex: 1, marginRight: 8 }}>
                          <div style={{ fontSize: "12.5px", fontWeight: 600, display: "flex", alignItems: "center", gap: 4, textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                            {cam.label}
                            {role === "admin" && cam.owner_username && (
                              <span style={{ fontSize: "10px", color: "var(--color-text-muted)", fontWeight: 400, background: "var(--color-border-light)", padding: "1px 4px", borderRadius: 3 }}>
                                <User size={8} style={{ display: "inline", marginRight: 2 }} />
                                {cam.owner_username}
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: "11px", color: "var(--color-text-muted)", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap", fontFamily: "monospace" }}>
                            {isCamRtsp ? cam.rtsp_url : `Webcam ID: ${cam.webcam_device_id ? cam.webcam_device_id.substring(0, 12) + "..." : "Browser Default"}`}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: "4px" }}>
                          <button
                            className={`btn btn-sm ${isActive ? "btn-primary" : "btn-ghost"}`}
                            onClick={() => handleConnectCamera(cam)}
                            title="Aktifkan kamera"
                            style={{ padding: "4px 6px", height: "auto" }}
                            disabled={isSpinning}
                          >
                            <Play size={11} />
                          </button>
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => handleEditClick(cam)}
                            title="Edit"
                            style={{ padding: "4px 6px", height: "auto" }}
                          >
                            <Edit2 size={11} />
                          </button>
                          <button
                            className="btn btn-ghost btn-sm text-danger"
                            onClick={() => handleDeleteCamera(cam.id)}
                            title="Hapus"
                            style={{ padding: "4px 6px", height: "auto" }}
                          >
                            <Trash2 size={11} style={{ color: "var(--color-danger)" }} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* ADD / EDIT FORM */}
          <div className="card">
            <div className="card-header">
              <span className="card-title" style={{ fontSize: "13px" }}>
                {editingCamId ? "Edit Detail Kamera" : "Tambah Kamera Baru"}
              </span>
            </div>
            <form onSubmit={handleSaveCamera} className="card-body" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <div>
                <label className="form-label" style={{ marginBottom: 4 }}>Label Kamera</label>
                <input
                  className="form-input"
                  type="text"
                  placeholder="Kamera Pintu Utama / Gate 1"
                  value={formLabel}
                  onChange={(e) => setFormLabel(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="form-label" style={{ marginBottom: 4 }}>Jenis Kamera</label>
                <div style={{ display: "flex", gap: "16px", marginTop: 4 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "12.5px", cursor: "pointer" }}>
                    <input
                      type="radio"
                      name="formSourceType"
                      checked={formSourceType === "webcam"}
                      onChange={() => setFormSourceType("webcam")}
                    />
                    Webcam Lokal
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "12.5px", cursor: "pointer" }}>
                    <input
                      type="radio"
                      name="formSourceType"
                      checked={formSourceType === "rtsp"}
                      onChange={() => setFormSourceType("rtsp")}
                    />
                    CCTV RTSP
                  </label>
                </div>
              </div>

              {formSourceType === "rtsp" ? (
                <div>
                  <label className="form-label" style={{ marginBottom: 4 }}>Alamat RTSP URL</label>
                  <input
                    className="form-input"
                    type="text"
                    placeholder="rtsp://user:pass@ip:port/stream"
                    value={formRtspUrl}
                    onChange={(e) => setFormRtspUrl(e.target.value)}
                    required={formSourceType === "rtsp"}
                    style={{ fontFamily: "monospace", fontSize: 11 }}
                  />
                </div>
              ) : (
                <div>
                  <label className="form-label" style={{ marginBottom: 4 }}>Pilih Kamera Lokal (Browser)</label>
                  <select
                    className="form-select"
                    value={formWebcamDeviceId}
                    onChange={(e) => setFormWebcamDeviceId(e.target.value)}
                  >
                    {browserDevices.length > 0 ? (
                      browserDevices.map((dev, idx) => (
                        <option key={dev.deviceId || idx} value={dev.deviceId}>
                          {dev.label || `Kamera #${idx + 1}`}
                        </option>
                      ))
                    ) : (
                      <option value="">Tidak ada kamera terdeteksi di browser</option>
                    )}
                  </select>
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={isSpinning}>
                    Simpan
                  </button>
                  <button type="button" className="btn btn-outline" onClick={handleTestForm} disabled={isSpinning} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <Wifi size={13} /> Test
                  </button>
                </div>
                {editingCamId && (
                  <button type="button" className="btn btn-ghost" onClick={handleResetForm} disabled={isSpinning}>
                    Batal Edit
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* CONFIG STATUS */}
          <div className="card">
            <div className="card-header">
              <span className="card-title" style={{ fontSize: "13px" }}>Status Aliran Aktif</span>
            </div>
            <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {([
                ["Mode Aktif", settings?.use_rtsp ? "RTSP (CCTV)" : "Webcam / USB"],
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
      </div>

      <style jsx global>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </PageShell>
  );
}
