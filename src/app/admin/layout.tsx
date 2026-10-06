import type { Metadata } from "next";
import { NavLink } from "@/admin/nav-link";
import "./admin.css";

export const metadata: Metadata = {
  title: { default: "Kora admin", template: "%s · Kora admin" },
  robots: { index: false, follow: false },
};

// A second root layout: the review pages are English, left to right, and
// share nothing with the localized site, not even its stylesheet or fonts.
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <html lang="en" dir="ltr">
      <body>
        <nav className="admin" aria-label="Admin pages">
          <NavLink href="/admin/pool">Pool review</NavLink>
          <NavLink href="/admin/chkoun">Chkoun? calendar</NavLink>
        </nav>
        {children}
      </body>
    </html>
  );
}
