const BACKEND = typeof window === "undefined"
  ? (process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:5001")
  : "";

export const API = {
  status: () => `${BACKEND}/api/status`,
  detectionsLive: () => `${BACKEND}/api/detections/live`,
  cameras: () => `${BACKEND}/api/cameras`,
  cameraSettings: () => `${BACKEND}/api/camera/settings`,
  cameraTest: () => `${BACKEND}/api/camera/test`,
  violations: (params: Record<string, string | number>) => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)]))
    ).toString();
    return `${BACKEND}/api/violations?${qs}`;
  },
  violationsExport: (params: Record<string, string>) => {
    const qs = new URLSearchParams(params).toString();
    return `${BACKEND}/api/violations/export?${qs}`;
  },
  analyticsSummary: () => `${BACKEND}/api/analytics/summary`,
  analyticsHourly: () => `${BACKEND}/api/analytics/hourly`,
  analyticsByType: () => `${BACKEND}/api/analytics/by-type`,
  detectionToggle: () => `${BACKEND}/api/detection/toggle`,
  users: () => `${BACKEND}/api/users`,
  usersDetail: (id: number) => `${BACKEND}/api/users/${id}`,
  myCameras: () => `${BACKEND}/api/my-cameras`,
  myCamerasDetail: (id: number | string) => `${BACKEND}/api/my-cameras/${id}`,
  logout: () => `${BACKEND}/api/logout`,
  sessionVerify: () => `${BACKEND}/api/session/verify`,

  videoFeed: () => {
    // <img> tags in Next.js cannot easily supply custom Authorization headers.
    // While same-origin cookies are sent automatically, cross-origin cookies on localhost
    // can be blocked by browser security policies (e.g. if not using HTTPS with SameSite=None).
    // Therefore, we append the session token as a query parameter (?token=...) to ensure
    // the MJPEG stream renders reliably on macOS/Windows environments without security blocks.
    const token = typeof window !== "undefined" ? localStorage.getItem("token") || "" : "";
    return `${BACKEND}/video_feed?token=${encodeURIComponent(token)}`;
  },
};


export async function apiFetch<T>(url: string, opts?: RequestInit): Promise<T> {
  const headers = new Headers(opts?.headers);
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("token");
    if (token && !headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  }

  const res = await fetch(url, {
    ...opts,
    headers,
    credentials: "include", // Send the httpOnly session_token cookie automatically
    cache: "no-store",
  });

  if (res.status === 401 && typeof window !== "undefined" && !url.includes("/api/login")) {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    localStorage.removeItem("username");
    // Clear user_role cookie so middleware knows to allow /login rendering
    document.cookie = "user_role=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC;";
    window.location.href = "/login";
  }

  if (!res.ok) {
    try {
      const errorBody = await res.json();
      if (errorBody && errorBody.message) {
        throw new Error(errorBody.message);
      }
    } catch {
      // Fallback if not JSON or doesn't have message
    }
    throw new Error(`API error ${res.status}: ${url}`);
  }
  return res.json();
}


