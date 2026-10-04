import type { Metadata } from "next";
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
      <body>{children}</body>
    </html>
  );
}
