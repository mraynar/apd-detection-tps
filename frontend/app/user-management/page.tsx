"use client";

import { useState, useEffect, useCallback } from "react";
import PageShell from "@/components/PageShell";
import { API, apiFetch } from "@/lib/api";
import {
  Users, Shield, AlertCircle, CheckCircle, Loader,
  Pencil, Trash2, UserPlus, X, Eye, EyeOff
} from "lucide-react";

interface User {
  id: number;
  username: string;
  role: string;
  created_at: string;
}

type ModalState =
  | { type: "none" }
  | { type: "delete"; user: User }
  | { type: "edit"; user: User };

function ConfirmDeleteModal({
  user,
  onConfirm,
  onCancel,
  loading,
}: {
  user: User;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "rgba(0,0,0,0.5)",
      display: "flex", alignItems: "center", justifyContent: "center",
      backdropFilter: "blur(4px)",
      padding: "16px",
    }}>
      <div style={{
        background: "var(--color-surface)",
        borderRadius: "var(--radius-md)",
        padding: "24px",
        maxWidth: "400px", width: "100%",
        boxShadow: "var(--shadow-lg)",
        display: "flex", flexDirection: "column", gap: "16px",
      }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
          <div style={{
            width: 36, height: 36, borderRadius: "50%",
            background: "var(--color-danger-dim)",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}>
            <Trash2 size={16} style={{ color: "var(--color-danger)" }} />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: "14px", marginBottom: "4px" }}>
              Hapus Akun User
            </div>
            <div style={{ fontSize: "13px", color: "var(--color-text-secondary)", lineHeight: 1.5 }}>
              Apakah Anda yakin ingin menghapus akun{" "}
              <strong style={{ color: "var(--color-text-primary)" }}>{user.username}</strong>?{" "}
              Tindakan ini tidak dapat dibatalkan.
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
          <button
            className="btn btn-outline"
            onClick={onCancel}
            disabled={loading}
            style={{ minWidth: "80px" }}
          >
            Batal
          </button>
          <button
            className="btn btn-danger"
            onClick={onConfirm}
            disabled={loading}
            style={{ minWidth: "100px", display: "flex", alignItems: "center", gap: "6px" }}
          >
            {loading ? <Loader size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Trash2 size={14} />}
            {loading ? "Menghapus…" : "Hapus"}
          </button>
        </div>
      </div>
    </div>
  );
}

function EditUserModal({
  user,
  onConfirm,
  onCancel,
  loading,
}: {
  user: User;
  onConfirm: (role: string, password: string) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const [editRole, setEditRole] = useState(user.role);
  const [editPassword, setEditPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "rgba(0,0,0,0.5)",
      display: "flex", alignItems: "center", justifyContent: "center",
      backdropFilter: "blur(4px)",
      padding: "16px",
    }}>
      <div style={{
        background: "var(--color-surface)",
        borderRadius: "var(--radius-md)",
        padding: "24px",
        maxWidth: "420px", width: "100%",
        boxShadow: "var(--shadow-lg)",
        display: "flex", flexDirection: "column", gap: "20px",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{
              width: 36, height: 36, borderRadius: "50%",
              background: "var(--color-primary-dim)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Pencil size={16} style={{ color: "var(--color-primary)" }} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: "14px" }}>Edit Akun</div>
              <div style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>{user.username}</div>
            </div>
          </div>
          <button
            onClick={onCancel}
            disabled={loading}
            style={{ background: "none", border: "none", color: "var(--color-text-muted)", padding: "4px", cursor: "pointer" }}
          >
            <X size={18} />
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Role</label>
            <select
              className="form-select"
              value={editRole}
              onChange={(e) => setEditRole(e.target.value)}
            >
              <option value="user">User (Review & Analytics)</option>
              <option value="admin">Admin (System Operations)</option>
            </select>
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">
              Reset Password
              <span style={{ marginLeft: 6, fontSize: "10px", fontWeight: 400, color: "var(--color-text-muted)", textTransform: "none" }}>
                (kosongkan jika tidak ingin mengubah)
              </span>
            </label>
            <div style={{ position: "relative" }}>
              <input
                type={showPassword ? "text" : "password"}
                className="form-input"
                placeholder="Password baru (opsional)"
                value={editPassword}
                onChange={(e) => setEditPassword(e.target.value)}
                style={{ paddingRight: "40px" }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                style={{
                  position: "absolute", right: "10px", top: "50%",
                  transform: "translateY(-50%)",
                  background: "none", border: "none",
                  color: "var(--color-text-muted)", cursor: "pointer",
                  display: "flex", alignItems: "center",
                }}
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
          <button
            className="btn btn-outline"
            onClick={onCancel}
            disabled={loading}
            style={{ minWidth: "80px" }}
          >
            Batal
          </button>
          <button
            className="btn btn-primary"
            onClick={() => onConfirm(editRole, editPassword)}
            disabled={loading}
            style={{ minWidth: "100px", display: "flex", alignItems: "center", gap: "6px" }}
          >
            {loading ? <Loader size={14} style={{ animation: "spin 1s linear infinite" }} /> : <CheckCircle size={14} />}
            {loading ? "Menyimpan…" : "Simpan Perubahan"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function UserManagementPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [modal, setModal] = useState<ModalState>({ type: "none" });
  const [modalLoading, setModalLoading] = useState(false);

  // Create user form
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState("user");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);

  // Notifications
  const [notification, setNotification] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const showNotification = (type: "success" | "error", message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4000);
  };

  const fetchUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const data = await apiFetch<User[]>(API.users());
      setUsers(data);
    } catch {
      showNotification("error", "Gagal memuat daftar user.");
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim() || !newPassword.trim() || !newRole) {
      showNotification("error", "Semua field wajib diisi.");
      return;
    }
    setCreateLoading(true);
    try {
      await apiFetch(API.users(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: newUsername.trim(), password: newPassword, role: newRole }),
      });
      showNotification("success", `Akun "${newUsername}" berhasil dibuat.`);
      setNewUsername("");
      setNewPassword("");
      setNewRole("user");
      fetchUsers();
    } catch (err: unknown) {
      showNotification("error", err instanceof Error ? err.message : "Gagal membuat user.");
    } finally {
      setCreateLoading(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (modal.type !== "delete") return;
    setModalLoading(true);
    try {
      await apiFetch(API.usersDetail(modal.user.id), { method: "DELETE" });
      showNotification("success", `Akun "${modal.user.username}" berhasil dihapus.`);
      setModal({ type: "none" });
      fetchUsers();
    } catch (err: unknown) {
      showNotification("error", err instanceof Error ? err.message : "Gagal menghapus user.");
    } finally {
      setModalLoading(false);
    }
  };

  const handleEditConfirm = async (role: string, password: string) => {
    if (modal.type !== "edit") return;
    setModalLoading(true);
    try {
      const body: Record<string, string> = { role };
      if (password.trim()) body.password = password;
      await apiFetch(API.usersDetail(modal.user.id), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      showNotification("success", `Akun "${modal.user.username}" berhasil diperbarui.`);
      setModal({ type: "none" });
      fetchUsers();
    } catch (err: unknown) {
      showNotification("error", err instanceof Error ? err.message : "Gagal memperbarui user.");
    } finally {
      setModalLoading(false);
    }
  };

  return (
    <>
      {/* Modals */}
      {modal.type === "delete" && (
        <ConfirmDeleteModal
          user={modal.user}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setModal({ type: "none" })}
          loading={modalLoading}
        />
      )}
      {modal.type === "edit" && (
        <EditUserModal
          user={modal.user}
          onConfirm={handleEditConfirm}
          onCancel={() => setModal({ type: "none" })}
          loading={modalLoading}
        />
      )}

      <PageShell
        title="User Management"
        subtitle="Kelola akun dan hak akses pengguna sistem"
      >
        {/* Notification Toast */}
        {notification && (
          <div
            className={`alert ${notification.type === "success" ? "alert-success" : "alert-danger"}`}
            style={{ marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px" }}
          >
            {notification.type === "success"
              ? <CheckCircle size={15} />
              : <AlertCircle size={15} />
            }
            {notification.message}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

          {/* ===== Create User Card ===== */}
          <div className="card">
            <div className="card-header">
              <span className="card-title" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <UserPlus size={15} style={{ color: "var(--color-primary)" }} />
                Tambah Akun Baru
              </span>
            </div>
            <div className="card-body">
              <form onSubmit={handleCreateUser} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Username</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="Contoh: operator2"
                      value={newUsername}
                      onChange={(e) => setNewUsername(e.target.value)}
                      disabled={createLoading}
                    />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Password</label>
                    <div style={{ position: "relative" }}>
                      <input
                        type={showNewPassword ? "text" : "password"}
                        className="form-input"
                        placeholder="••••••••"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        disabled={createLoading}
                        style={{ paddingRight: "40px" }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword((v) => !v)}
                        style={{
                          position: "absolute", right: "10px", top: "50%",
                          transform: "translateY(-50%)",
                          background: "none", border: "none",
                          color: "var(--color-text-muted)", cursor: "pointer",
                          display: "flex", alignItems: "center",
                        }}
                      >
                        {showNewPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Role</label>
                    <select
                      className="form-select"
                      value={newRole}
                      onChange={(e) => setNewRole(e.target.value)}
                      disabled={createLoading}
                    >
                      <option value="user">User (Review & Analytics)</option>
                      <option value="admin">Admin (System Operations)</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={createLoading}
                    style={{ minWidth: "140px", display: "flex", alignItems: "center", gap: "6px" }}
                  >
                    {createLoading
                      ? <><Loader size={14} style={{ animation: "spin 1s linear infinite" }} /> Membuat…</>
                      : <><UserPlus size={14} /> Buat Akun</>
                    }
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* ===== Users List Card ===== */}
          <div className="card">
            <div className="card-header">
              <span className="card-title" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Users size={15} style={{ color: "var(--color-text-secondary)" }} />
                Daftar Akun Terdaftar
              </span>
              <span style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>
                {loadingUsers ? "Memuat…" : `${users.length} akun`}
              </span>
            </div>

            <div className="table-wrapper">
              {loadingUsers ? (
                <table>
                  <tbody>
                    {Array.from({ length: 3 }).map((_, i) => (
                      <tr key={i}>
                        {Array.from({ length: 4 }).map((_, j) => (
                          <td key={j}><div className="skeleton" style={{ height: 18, borderRadius: 4 }} /></td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : users.length === 0 ? (
                <div className="empty-state" style={{ padding: "40px" }}>
                  <div className="empty-state-icon"><Users size={32} /></div>
                  <h3>Belum ada akun terdaftar</h3>
                  <p>Gunakan form di atas untuk membuat akun baru.</p>
                </div>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Username</th>
                      <th>Role</th>
                      <th>Dibuat Pada</th>
                      <th style={{ textAlign: "right" }}>Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u, idx) => (
                      <tr key={u.id} className="fade-in">
                        <td style={{ color: "var(--color-text-muted)", fontSize: 12, width: 40 }}>
                          {idx + 1}
                        </td>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <div style={{
                              width: 28, height: 28, borderRadius: "50%",
                              background: u.role === "admin" ? "var(--color-warning-dim)" : "var(--color-primary-dim)",
                              display: "flex", alignItems: "center", justifyContent: "center",
                              fontSize: "11px", fontWeight: 700,
                              color: u.role === "admin" ? "var(--color-warning)" : "var(--color-primary)",
                              flexShrink: 0,
                            }}>
                              {u.username.charAt(0).toUpperCase()}
                            </div>
                            <span style={{ fontWeight: 600, fontSize: "13px" }}>{u.username}</span>
                          </div>
                        </td>
                        <td>
                          <span
                            className={`badge ${u.role === "admin" ? "badge-warning" : "badge-safe"}`}
                            style={{ fontSize: "11px" }}
                          >
                            {u.role === "admin" ? (
                              <><Shield size={10} /> Admin</>
                            ) : (
                              "User"
                            )}
                          </span>
                        </td>
                        <td style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
                          {new Date(u.created_at).toLocaleDateString("id-ID", {
                            year: "numeric", month: "short", day: "numeric",
                            hour: "2-digit", minute: "2-digit",
                          })}
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                            <button
                              className="btn btn-outline btn-sm"
                              onClick={() => setModal({ type: "edit", user: u })}
                              style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "12px" }}
                            >
                              <Pencil size={12} /> Edit
                            </button>
                            <button
                              className="btn btn-danger btn-sm"
                              onClick={() => setModal({ type: "delete", user: u })}
                              style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "12px" }}
                            >
                              <Trash2 size={12} /> Hapus
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* ===== Role Information Card ===== */}
          <div className="card">
            <div className="card-header">
              <span className="card-title" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Shield size={15} style={{ color: "var(--color-text-secondary)" }} />
                Informasi Role & Hak Akses
              </span>
            </div>
            <div className="card-body">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                <div style={{
                  background: "var(--color-warning-dim)",
                  borderRadius: "var(--radius-sm)",
                  padding: "16px",
                  border: "1px solid rgba(245,158,11,0.2)",
                }}>
                  <div style={{ fontWeight: 700, fontSize: "13px", color: "var(--color-warning)", marginBottom: "8px", display: "flex", alignItems: "center", gap: "6px" }}>
                    <Shield size={13} /> Admin
                  </div>
                  <ul style={{ fontSize: "12px", color: "var(--color-text-secondary)", lineHeight: 2, margin: 0, paddingLeft: "16px" }}>
                    <li>Live Monitoring & kendali kamera</li>
                    <li>Camera & RTSP Settings</li>
                    <li>Violation History</li>
                    <li>Analytics & laporan</li>
                    <li>User Management (halaman ini)</li>
                  </ul>
                </div>
                <div style={{
                  background: "var(--color-success-dim)",
                  borderRadius: "var(--radius-sm)",
                  padding: "16px",
                  border: "1px solid rgba(22,163,74,0.2)",
                }}>
                  <div style={{ fontWeight: 700, fontSize: "13px", color: "var(--color-success)", marginBottom: "8px", display: "flex", alignItems: "center", gap: "6px" }}>
                    <Users size={13} /> User (Operator)
                  </div>
                  <ul style={{ fontSize: "12px", color: "var(--color-text-secondary)", lineHeight: 2, margin: 0, paddingLeft: "16px" }}>
                    <li>Violation History (view only)</li>
                    <li>Analytics & laporan</li>
                    <li>Export data CSV</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

        </div>
      </PageShell>

      <style jsx global>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </>
  );
}
