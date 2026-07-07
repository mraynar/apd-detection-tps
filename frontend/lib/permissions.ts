export const ROLE_PAGES: Record<string, string[]> = {
  admin: ["/live-monitoring", "/camera-settings", "/violation-history", "/analytics", "/user-management"],
  user: ["/violation-history", "/analytics", "/live-monitoring", "/camera-settings"],
};

export const DEFAULT_PAGE: Record<string, string> = {
  admin: "/live-monitoring",
  user: "/violation-history",
};

export function isRouteAllowed(role: string, pathname: string): boolean {
  const allowed = ROLE_PAGES[role] || [];
  return allowed.some(route => pathname === route || pathname.startsWith(route + "/"));
}
