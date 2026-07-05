import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Login — APD Detection System",
};

/**
 * Login Layout — Server Component.
 * Overrides root layout's AppShell rendering for the /login route.
 * Login page needs full-page coverage (gradient background) without sidebar.
 * 
 * This layout simply passes children through — the root layout's <html>/<body>
 * wrapper still applies, but AppShell is bypassed because we import it in root layout
 * and it conditionally skips sidebar for /login via usePathname.
 * 
 * However, to avoid any SSR mismatch/flash, login page renders in its own style.
 */
export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
