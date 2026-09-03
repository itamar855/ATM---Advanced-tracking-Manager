import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import BottomNav from "@/components/layout/BottomNav";
import StoreGuard from "@/components/layout/StoreGuard";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-[#0B0E14]">
      <Sidebar />
      <div className="flex-1 ml-0 md:ml-[var(--sidebar-width)] transition-all duration-300 min-w-0">
        <Header />
        <main className="p-3 md:p-6 bg-glow min-h-[calc(100vh-4rem)] pb-24 md:pb-6">
          <StoreGuard>
            {children}
          </StoreGuard>
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
