import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import StoreGuard from "@/components/layout/StoreGuard";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 ml-[var(--sidebar-width)] transition-all duration-300">
        <Header />
        <main className="p-6 bg-glow min-h-[calc(100vh-4rem)]">
          <StoreGuard>
            {children}
          </StoreGuard>
        </main>
      </div>
    </div>
  );
}
