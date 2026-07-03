"use client";

import { useState, useEffect, useCallback } from "react";
import PageShell from "@/components/PageShell";
import { API, apiFetch } from "@/lib/api";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from "recharts";
import { TrendingUp, TrendingDown, Minus, Activity, AlertTriangle, Shield, BarChart2 } from "lucide-react";

interface AnalyticsSummary {
  total_detected_today: number;
  total_violations_today: number;
  compliance_rate_pct: number | null;
  trend_total_vs_yesterday: number | null;
  trend_violations_vs_yesterday: number | null;
  trend_compliance_vs_yesterday: number | null;
}

interface HourlyData {
  hour: number;
  label: string;
  total_activity: number;
  violations: number;
}

interface ByTypeData {
  type: string;
  count: number;
}

function TrendBadge({ value }: { value: number | null }) {
  if (value === null) return <span className="stat-trend neutral">— data belum cukup</span>;
  if (value > 0) return (
    <span className="stat-trend up">
      <TrendingUp size={12} /> +{value.toFixed(1)}% vs kemarin
    </span>
  );
  if (value < 0) return (
    <span className="stat-trend down">
      <TrendingDown size={12} /> {value.toFixed(1)}% vs kemarin
    </span>
  );
  return <span className="stat-trend neutral"><Minus size={12} /> Sama seperti kemarin</span>;
}

const TYPE_LABELS: Record<string, string> = {
  "head": "No Helmet",
  "NO-Safety Vest": "No Safety Vest",
};

export default function AnalyticsPage() {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [hourly, setHourly] = useState<HourlyData[]>([]);
  const [byType, setByType] = useState<ByTypeData[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    try {
      const [s, h, t] = await Promise.all([
        apiFetch<AnalyticsSummary>(API.analyticsSummary()),
        apiFetch<HourlyData[]>(API.analyticsHourly()),
        apiFetch<ByTypeData[]>(API.analyticsByType()),
      ]);
      setSummary(s);
      setHourly(h);
      setByType(t);
    } catch {
      // Backend unreachable — leave state as null
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Find peak hour from hourly data
  const peakHour = hourly.reduce<HourlyData | null>((max, cur) =>
    !max || cur.total_activity > max.total_activity ? cur : max, null);

  const totalViolationsToday = summary?.total_violations_today ?? 0;
  const maxTypeCount = byType.reduce((m, t) => Math.max(m, t.count), 1);

  return (
    <PageShell title="Analytics" subtitle="TPS Petikemas Surabaya">
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

        {/* ===== 3 Summary Cards ===== */}
        <div className="grid-3">
          {/* Total Deteksi Hari Ini */}
          <div className="stat-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div className="stat-card-label">
                  <Activity size={11} style={{ display: "inline", marginRight: 4 }} />
                  Total Deteksi Hari Ini
                </div>
                <div className="stat-card-value primary">
                  {loading ? <div className="skeleton" style={{ width: 60, height: 32 }} /> : summary?.total_detected_today ?? 0}
                </div>
                <TrendBadge value={summary?.trend_total_vs_yesterday ?? null} />
              </div>
              <div style={{
                width: 40, height: 40, borderRadius: "var(--radius-sm)",
                background: "var(--color-primary-dim)",
                display: "flex", alignItems: "center", justifyContent: "center"
              }}>
                <Activity size={18} style={{ color: "var(--color-primary)" }} />
              </div>
            </div>
          </div>

          {/* Total Pelanggaran Hari Ini */}
          <div className="stat-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div className="stat-card-label">
                  <AlertTriangle size={11} style={{ display: "inline", marginRight: 4 }} />
                  Pelanggaran Hari Ini
                </div>
                <div className="stat-card-value danger">
                  {loading ? <div className="skeleton" style={{ width: 50, height: 32 }} /> : totalViolationsToday}
                </div>
                <TrendBadge value={summary?.trend_violations_vs_yesterday ?? null} />
              </div>
              <div style={{
                width: 40, height: 40, borderRadius: "var(--radius-sm)",
                background: "var(--color-danger-dim)",
                display: "flex", alignItems: "center", justifyContent: "center"
              }}>
                <AlertTriangle size={18} style={{ color: "var(--color-danger)" }} />
              </div>
            </div>
          </div>

          {/* Compliance Rate */}
          <div className="stat-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div className="stat-card-label">
                  <Shield size={11} style={{ display: "inline", marginRight: 4 }} />
                  Compliance Rate
                </div>
                <div className="stat-card-value success">
                  {loading ? (
                    <div className="skeleton" style={{ width: 70, height: 32 }} />
                  ) : summary?.compliance_rate_pct != null ? (
                    `${summary.compliance_rate_pct}%`
                  ) : (
                    <span style={{ fontSize: "16px", color: "var(--color-text-muted)" }}>N/A</span>
                  )}
                </div>
                {summary?.compliance_rate_pct == null && (
                  <div className="text-sm text-muted mt-1">Belum ada data hari ini</div>
                )}
                <TrendBadge value={summary?.trend_compliance_vs_yesterday ?? null} />
              </div>
              <div style={{
                width: 40, height: 40, borderRadius: "var(--radius-sm)",
                background: "var(--color-success-dim)",
                display: "flex", alignItems: "center", justifyContent: "center"
              }}>
                <Shield size={18} style={{ color: "var(--color-success)" }} />
              </div>
            </div>
          </div>
        </div>

        {/* ===== Hourly Bar Chart ===== */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Tren Pelanggaran per Jam — Hari Ini</span>
            <BarChart2 size={15} style={{ color: "var(--color-text-secondary)" }} />
          </div>
          <div className="card-body">
            {loading ? (
              <div className="skeleton" style={{ height: 240, borderRadius: "var(--radius-sm)" }} />
            ) : hourly.every((h) => h.total_activity === 0) ? (
              <div className="empty-state">
                <div className="empty-state-icon"><BarChart2 size={32} /></div>
                <h3>Belum ada data aktivitas hari ini</h3>
                <p>Chart akan terisi setelah sistem mendeteksi objek. Pastikan backend aktif dan kamera berjalan.</p>
              </div>
            ) : (
              <div className="chart-wrapper" style={{ height: 260 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={hourly}
                    margin={{ top: 4, right: 16, left: -10, bottom: 0 }}
                    barCategoryGap="30%"
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-light)" />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 11, fill: "var(--color-text-secondary)" }}
                      tickLine={false}
                      axisLine={false}
                      interval={2}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: "var(--color-text-secondary)" }}
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "var(--color-surface)",
                        border: "1px solid var(--color-border)",
                        borderRadius: "var(--radius-sm)",
                        fontSize: 12,
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
                    <Bar dataKey="total_activity" name="Total Aktivitas" fill="#4A90D9" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="violations" name="Pelanggaran" fill="#DC2626" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>

        {/* Bottom row: By-type + Operation Summary */}
        <div className="grid-2">
          {/* Pelanggaran per Tipe */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">Pelanggaran per Tipe</span>
              <AlertTriangle size={15} style={{ color: "var(--color-danger)" }} />
            </div>
            <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {loading ? (
                Array.from({ length: 2 }).map((_, i) => (
                  <div key={i} className="skeleton" style={{ height: 44, borderRadius: "var(--radius-sm)" }} />
                ))
              ) : byType.length === 0 ? (
                <div className="empty-state" style={{ padding: "24px" }}>
                  <p style={{ fontSize: "12px" }}>Belum ada data pelanggaran hari ini</p>
                </div>
              ) : (
                byType.map((t) => {
                  const pct = Math.round((t.count / maxTypeCount) * 100);
                  const label = TYPE_LABELS[t.type] ?? t.type;
                  return (
                    <div key={t.type}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 600 }}>{label}</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--color-danger)" }}>
                          {t.count} kejadian
                        </span>
                      </div>
                      <div className="progress-bar" style={{ height: 8 }}>
                        <div
                          className="progress-fill danger"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })
              )}

              {/* Chinstrap — coming soon, explicitly disabled */}
              <div style={{ marginTop: 4, paddingTop: 12, borderTop: "1px solid var(--color-border-light)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 13, color: "var(--color-text-muted)", display: "flex", alignItems: "center", gap: 6 }}>
                    Chinstrap
                    <span className="badge badge-neutral" style={{ fontSize: "10px", padding: "1px 7px" }}>
                      Coming Soon
                    </span>
                  </span>
                  <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Dataset belum tersedia</span>
                </div>
                <div className="progress-bar" style={{ height: 8 }}>
                  <div className="progress-fill" style={{ width: "0%", background: "var(--color-border)" }} />
                </div>
              </div>
            </div>
          </div>

          {/* Operation Summary (navy card) */}
          <div className="summary-card-navy">
            <h3>Operation Summary</h3>
            {loading ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} style={{ height: 16, background: "rgba(255,255,255,0.1)", borderRadius: 4, animation: "shimmer 1.5s infinite" }} />
                ))}
              </div>
            ) : (
              <p>
                {summary?.total_detected_today === 0 ? (
                  <>
                    Belum ada deteksi tercatat hari ini.{" "}
                    <span className="highlight">Pastikan kamera dan backend aktif</span> untuk mulai mengumpulkan data operasional.
                  </>
                ) : (
                  <>
                    Total <span className="highlight">{summary?.total_detected_today}</span> objek terdeteksi hari ini, dengan{" "}
                    <span className="highlight">{totalViolationsToday}</span> pelanggaran APD.
                    {peakHour && peakHour.total_activity > 0 && (
                      <> Jam dengan aktivitas tertinggi: <span className="highlight">{peakHour.label}</span> ({peakHour.total_activity} deteksi).</>
                    )}
                    {summary?.compliance_rate_pct != null ? (
                      <> Tingkat kepatuhan: <span className="highlight">{summary.compliance_rate_pct}%</span>.</>
                    ) : (
                      " Data kepatuhan sedang diakumulasi."
                    )}
                    <br /><br />
                    <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)" }}>
                      ℹ️ Statistik ini didasarkan pada deteksi model YOLOv8. Akurasi dapat bervariasi tergantung
                      jarak kamera dan kondisi pencahayaan. Data pelatihan belum sepenuhnya representatif
                      kondisi lapangan CCTV.
                    </span>
                  </>
                )}
              </p>
            )}
          </div>
        </div>
      </div>
    </PageShell>
  );
}
