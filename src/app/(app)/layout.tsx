import Header from "@/components/Header";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="lg:ml-sidebar-width pt-header-height">
        {children}
      </div>
    </div>
  );
}
