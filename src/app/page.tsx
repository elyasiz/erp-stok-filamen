"use client";

import { BarChart3, Bell, Boxes, ChevronDown, ClipboardCheck, Clock3, History, LayoutDashboard, Menu, PackagePlus, Plus, ScanBarcode, ScanLine, Search, Settings, Users, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { ModuleView, type ViewId } from "@/components/modules";
import DashboardView from "@/components/dashboard-view";
import { useReports, type ReportState } from "@/components/report-state";
import { AuthProvider, useAuth } from "@/components/auth-provider";
import LoginView from "@/components/login-view";
import { PasswordChangeScreen } from "@/components/password-form";
import { initials, ProfileView } from "@/components/accounts-view";
import MyUsageView from "@/components/my-usage-view";
import { isStaff, roleLabels } from "@/lib/account-types";

const navigation: Array<{ label: string; items: Array<{ label: string; icon: LucideIcon; view: ViewId; count?: string }> }> = [
  {
    label: "Utama",
    items: [
      { label: "Dashboard", icon: LayoutDashboard, view: "dashboard" },
      { label: "Stok filamen", icon: Boxes, view: "inventory" },
    ],
  },
  {
    label: "Operasional",
    items: [
      { label: "Barang masuk", icon: PackagePlus, view: "receipt" },
      { label: "Mulai penggunaan", icon: ScanLine, view: "usage-start" },
      { label: "Penggunaan aktif", icon: Clock3, view: "usage-active" },
      { label: "Selesaikan", icon: ClipboardCheck, view: "usage-complete" },
      { label: "Penggunaan saya", icon: Clock3, view: "my-usage" },
    ],
  },
  {
    label: "Pengawasan",
    items: [
      { label: "Laporan", icon: BarChart3, view: "reports" },
      { label: "Riwayat stok", icon: History, view: "history" },
      { label: "Pengguna & hak akses", icon: Users, view: "users" },
      { label: "Aktivitas pengguna", icon: History, view: "activity" },
    ],
  },
];

function Logo() {
  return (
    <div className="brand-lockup" aria-label="TIDIGO ERP Stok Filamen">
      <span className="brand-logo-card">
        <Image src="/tidigo-logo.png" alt="TIDIGO — From Ideas to 3D Objects" width={872} height={286} priority />
      </span>
      <small>ERP · STOK FILAMEN</small>
    </div>
  );
}

function Sidebar({ open, activeView, onClose, onSelect, reports }: { reports: ReportState; open: boolean; activeView: ViewId; onClose: () => void; onSelect: (view: ViewId) => void }) {
  const { user } = useAuth();
  const panelRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const mobile = window.matchMedia("(max-width: 1024px)");
    const panel = panelRef.current;
    if (!open || !mobile.matches || !panel) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panel.querySelector<HTMLButtonElement>(".sidebar-close")?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); }
      if (event.key !== "Tab") return;
      const buttons = Array.from(panel.querySelectorAll<HTMLButtonElement>("button:not([disabled])")).filter(button => button.getClientRects().length);
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    const handleResize = () => { if (!mobile.matches) onClose(); };
    document.addEventListener("keydown", handleKey);
    mobile.addEventListener("change", handleResize);
    return () => {
      document.removeEventListener("keydown", handleKey);
      mobile.removeEventListener("change", handleResize);
      if (previousFocus?.getClientRects().length) previousFocus.focus();
    };
  }, [open, onClose]);
  const allowed = (view: ViewId) => user && (view === "users" || view === "settings" ? user.role === "OWNER" : ["reports", "history", "receipt", "activity"].includes(view) ? isStaff(user) : true);
  const groups = navigation.map(group => ({ ...group, items: group.items.filter(item => allowed(item.view)) })).filter(group => group.items.length);
  return (
    <>
      <div className={`sidebar-backdrop ${open ? "show" : ""}`} onClick={onClose} aria-hidden="true" />
      <aside ref={panelRef} id="tidigo-navigation" className={`sidebar ${open ? "open" : ""}`} role={open ? "dialog" : undefined} aria-modal={open || undefined} aria-label="Menu utama">
        <div className="sidebar-top">
          <Logo />
          <button className="icon-button sidebar-close" onClick={onClose} aria-label="Tutup menu">
            <X size={20} />
          </button>
        </div>

        <nav className="main-nav" aria-label="Navigasi utama">
          {groups.map((group) => (
            <div className="nav-group" key={group.label}>
              <p>{group.label}</p>
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <button className={`nav-item ${activeView === item.view ? "active" : ""}`} key={item.label} type="button" onClick={() => onSelect(item.view)}>
                    <Icon size={18} strokeWidth={1.8} />
                    <span>{user?.role === "COACH" && item.view === "dashboard" ? "Beranda saya" : user?.role === "COACH" && item.view === "usage-active" ? "Penggunaan aktif saya" : item.label}</span>
                    {item.count ? <em>{item.count}</em> : null}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          {user?.role === "OWNER" ? <button className={`nav-item ${activeView === "settings" ? "active" : ""}`} type="button" onClick={() => onSelect("settings")}>
            <Settings size={18} strokeWidth={1.8} />
            <span>Pengaturan</span>
          </button> : null}
          {user && isStaff(user) ? <div className="storage-card">
            <div className="storage-card-head">
              <span>Stok sehat</span>
              <strong>{reports.loading || !reports.data ? "—" : `${reports.data.summary.healthyPercent}%`}</strong>
            </div>
            <div className="storage-bar"><i style={{ width: `${reports.loading ? 0 : reports.data?.summary.healthyPercent ?? 0}%` }} /></div>
            <small>{reports.error ? "Data stok belum tersedia" : reports.loading || !reports.data ? "Memuat stok..." : `${reports.data.summary.attentionUnits} unit perlu perhatian`}</small>
          </div> : null}
        </div>
      </aside>
    </>
  );
}

function Workspace() {
  const { user } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const [view, setView] = useState<ViewId>("dashboard");
  const reports = useReports(view, Boolean(user && isStaff(user)));
  const [usageSessionId, setUsageSessionId] = useState<string | null>(null);
  const selectView = (nextView: ViewId, sessionId?: string) => {
    if (!user) return;
    if (["users", "settings"].includes(nextView) && user.role !== "OWNER") return;
    if (["receipt", "reports", "history", "activity"].includes(nextView) && !isStaff(user)) return;
    setView(nextView);
    setUsageSessionId(sessionId ?? null);
    setMenuOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (!user) return null;
  return (
    <div className="app-shell">
      <Sidebar open={menuOpen} activeView={view} onClose={closeMenu} onSelect={selectView} reports={reports} />

      <div className="content-shell">
        <header className="topbar">
          <div className="topbar-start">
            <button className="icon-button menu-button" onClick={() => setMenuOpen(true)} aria-label="Buka menu" aria-controls="tidigo-navigation" aria-expanded={menuOpen}>
              <Menu size={21} />
            </button>
            <span className="topbar-logo" aria-hidden="true">
              <Image src="/tidigo-logo.png" alt="" width={872} height={286} priority />
            </span>
            <label className="global-search">
              <Search size={18} />
              <input placeholder="Cari barcode, produk, atau transaksi..." aria-label="Cari barcode, produk, atau transaksi" />
              <kbd>⌘ K</kbd>
            </label>
          </div>
          <div className="topbar-actions">
            <button className="icon-button notification" onClick={() => selectView("my-usage")} aria-label="Lihat penggunaan saya"><Bell size={19} /></button>
            <div className="divider" />
            <button className="profile-button" type="button" onClick={() => selectView("profile")}>
              <span className="avatar">{initials(user.name)}</span>
              <span className="profile-copy"><strong>{user.name}</strong><small>{roleLabels[user.role]}</small></span>
              <ChevronDown size={16} />
            </button>
          </div>
        </header>

        <main className="dashboard">
          {view === "profile" ? <ProfileView /> : view === "my-usage" || view === "dashboard" && user.role === "COACH" ? <MyUsageView onNavigate={selectView} /> : view === "dashboard" ? <DashboardView state={reports} onNavigate={selectView} /> : <ModuleView view={view} onNavigate={selectView} usageSessionId={usageSessionId} reports={reports} />}
        </main>
      </div>

      <button className="mobile-scan" onClick={() => selectView("usage-start")} aria-label="Mulai scan barcode"><Plus size={19} /><ScanBarcode size={21} /></button>
    </div>
  );
}

function AuthenticatedApp() {
  const { user } = useAuth();
  return user ? user.mustChangePassword ? <PasswordChangeScreen /> : <Workspace key={`${user.id}-${user.role}`} /> : <LoginView />;
}
export default function Home() { return <AuthProvider><AuthenticatedApp /></AuthProvider>; }
