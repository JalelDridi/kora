import { AdminNav } from "@/admin/admin-nav";

// A footballer's editor is reached from the pool, the games and Add: no place of its own is marked.
export default function Layout({
  children,
}: LayoutProps<"/admin/footballers">) {
  return (
    <>
      <AdminNav current={null} />
      {children}
    </>
  );
}
