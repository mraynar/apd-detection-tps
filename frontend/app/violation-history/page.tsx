"use client";

import { useState, useEffect, useCallback } from "react";
import PageShell from "@/components/PageShell";
import { API, apiFetch } from "@/lib/api";
import {
  Search, Download, AlertTriangle, ChevronLeft, ChevronRight,
  Eye, Filter
} from "lucide-react";

interface Violation {
  id: string;
  timestamp: string;
  label: string;
  confidence: number;
  camera_source: string;
}

interface ViolationsResponse {
  page: number;
  per_page: number;
  total_count: number;
  total_pages: number;
  data: Violation[];
}

const VIOLATION_TYPES = [
  { value: "", label: "Semua Tipe" },
  { value: "head", label: "No Helmet (head)" },
  { value: "NO-Safety Vest", label: "No Safety Vest" },
];

function formatDateTime(iso: string) {
  try {
    return new Date(iso).toLocaleString("id-ID", {
      year: "numeric", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function ViolationHistoryPage() {
  const [data, setData] = useState<ViolationsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterDate, setFilterDate] = useState("");

  const fetchViolations = useCallback(async (p = page) => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = {
        page: p,
        per_page: 20,
      };
      if (search) params.search = search;
      if (filterType) params.filter_type = filterType;
      if (filterDate) params.filter_date = filterDate;

      const result = await apiFetch<ViolationsResponse>(API.violations(params));
      setData(result);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [page, search, filterType, filterDate]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (page === 1) {
        fetchViolations(1);
      } else {
        setPage(1);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [search, filterType, filterDate]);

  useEffect(() => {
    fetchViolations(page);
  }, [page]);

  const handleExport = () => {
    const params: Record<string, string> = {};
    if (search) params.search = search;
    if (filterType) params.filter_type = filterType;
    if (filterDate) params.filter_date = filterDate;
    window.open(API.violationsExport(params), "_blank");
  };

  const totalPages = data?.total_pages ?? 1;
  const violations = data?.data ?? [];

  return (
    <PageShell
      title="Violation History"
      subtitle="TPS Petikemas Surabaya"
      actions={
        <button className="btn btn-outline btn-sm" onClick={handleExport}>
          <Download size={14} /> Export CSV
        </button>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

        {/* Filter Bar */}
        <div className="card">
          <div className="card-body" style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
            {/* Search */}
            <div className="form-group" style={{ flex: "1 1 220px" }}>
              <label className="form-label">
                <Search size={11} style={{ display: "inline", marginRight: 4 }} />
                Cari (Kamera / Tipe)
              </label>
              <div style={{ position: "relative" }}>
                <Search size={14} style={{
                  position: "absolute", left: 10, top: "50%",
                  transform: "translateY(-50%)", color: "var(--color-text-muted)"
                }} />
                <input
                  className="form-input"
                  style={{ paddingLeft: 32 }}
                  type="text"
                  placeholder="Cari kamera, tipe…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>

            {/* Type filter */}
            <div className="form-group" style={{ flex: "1 1 180px" }}>
              <label className="form-label">
                <Filter size={11} style={{ display: "inline", marginRight: 4 }} />
                Tipe Pelanggaran
              </label>
              <select
                className="form-select"
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
              >
                {VIOLATION_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>

            {/* Date filter */}
            <div className="form-group" style={{ flex: "1 1 160px" }}>
              <label className="form-label">Tanggal</label>
              <input
                className="form-input"
                type="date"
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
              />
            </div>

            {/* Reset */}
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => { setSearch(""); setFilterType(""); setFilterDate(""); setPage(1); }}
            >
              Reset Filter
            </button>
          </div>
        </div>

        {/* Summary strip */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: "13.5px", color: "var(--color-text-secondary)" }}>
            {loading ? "Memuat…" : (
              data ? (
                <span>
                  Menampilkan <strong>{violations.length}</strong> dari{" "}
                  <strong>{data.total_count}</strong> pelanggaran
                </span>
              ) : "Tidak dapat memuat data"
            )}
          </div>
          <div className="pagination">
            <button
              className="page-btn"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft size={15} />
            </button>
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              const p = i + 1;
              return (
                <button
                  key={p}
                  className={`page-btn ${p === page ? "active" : ""}`}
                  onClick={() => setPage(p)}
                  disabled={loading}
                >
                  {p}
                </button>
              );
            })}
            {totalPages > 7 && <span style={{ fontSize: 13, color: "var(--color-text-muted)" }}>…</span>}
            <button
              className="page-btn"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight size={15} />
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="card">
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Timestamp</th>
                  <th>Tipe Pelanggaran</th>
                  <th>Confidence</th>
                  <th>Sumber Kamera</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 6 }).map((_, j) => (
                        <td key={j}>
                          <div className="skeleton" style={{ height: 18, borderRadius: 4 }} />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : violations.length === 0 ? (
                  <tr>
                    <td colSpan={6}>
                      <div className="empty-state">
                        <div className="empty-state-icon"><AlertTriangle size={32} /></div>
                        <h3>Belum ada pelanggaran tercatat</h3>
                        <p>
                          Data pelanggaran akan muncul setelah sistem mendeteksi pelanggaran APD.
                          Pastikan backend berjalan dan kamera aktif.
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  violations.map((v, idx) => {
                    const conf = Math.round(v.confidence * 100);
                    return (
                      <tr key={v.id} className="fade-in">
                        <td style={{ color: "var(--color-text-muted)", fontSize: 12 }}>
                          {(page - 1) * 20 + idx + 1}
                        </td>
                        <td>
                          <div style={{ fontSize: 13, fontWeight: 500 }}>{formatDateTime(v.timestamp)}</div>
                        </td>
                        <td>
                          <span className="badge badge-violation">
                            <AlertTriangle size={10} /> {v.label}
                          </span>
                        </td>
                        <td style={{ minWidth: 120 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{ flex: 1 }}>
                              <div className="progress-bar">
                                <div
                                  className={`progress-fill ${conf >= 70 ? "danger" : ""}`}
                                  style={{ width: `${conf}%` }}
                                />
                              </div>
                            </div>
                            <span style={{ fontSize: 12, fontWeight: 700, minWidth: 34 }}>{conf}%</span>
                          </div>
                        </td>
                        <td style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
                          {v.camera_source}
                        </td>
                        <td>
                          <button
                            className="btn btn-ghost btn-sm"
                            title="Lihat Detail"
                            style={{ padding: "4px 8px" }}
                            onClick={() => alert(`Detail pelanggaran:\nID: ${v.id}\nLabel: ${v.label}\nConfidence: ${conf}%\nWaktu: ${formatDateTime(v.timestamp)}\nKamera: ${v.camera_source}`)}
                          >
                            <Eye size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Bottom pagination */}
        {!loading && totalPages > 1 && (
          <div style={{ display: "flex", justifyContent: "center" }}>
            <div className="pagination">
              <button className="page-btn" disabled={page <= 1} onClick={() => setPage(1)}>«</button>
              <button className="page-btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft size={15} />
              </button>
              <span style={{ fontSize: 13, padding: "0 8px", color: "var(--color-text-secondary)" }}>
                Hal {page} dari {totalPages}
              </span>
              <button className="page-btn" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                <ChevronRight size={15} />
              </button>
              <button className="page-btn" disabled={page >= totalPages} onClick={() => setPage(totalPages)}>»</button>
            </div>
          </div>
        )}
      </div>
    </PageShell>
  );
}
