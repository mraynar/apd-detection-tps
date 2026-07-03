export const ROLE_PAGES: Record<string, string[]> = {
  admin: ["/live-monitoring", "/camera-settings"],
  user: ["/violation-history", "/analytics"],
};

export const DEFAULT_PAGE: Record<string, string> = {
  admin: "/live-monitoring",
  user: "/violation-history",
};

export function isRouteAllowed(role: string, pathname: string): boolean {
  const allowed = ROLE_PAGES[role] || [];
  return allowed.some(route => pathname === route || pathname.startsWith(route + "/"));
}
