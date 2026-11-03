import { AdminNav } from "@/admin/admin-nav";

// The admin nav, with this section marked (src/admin/admin-nav.tsx).
export default function Layout({ children }: LayoutProps<"/admin/chkoun">) {
  return (
    <>
      <AdminNav current={"calendar"} />
      {children}
    </>
  );
}
