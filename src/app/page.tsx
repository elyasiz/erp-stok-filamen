"use client";

import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Bell,
  Boxes,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Clock3,
  History,
  LayoutDashboard,
  Menu,
  MoreHorizontal,
  PackagePlus,
  Plus,
  ReceiptText,
  ScanBarcode,
  ScanLine,
  Search,
  Settings,
  Users,
  Weight,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";
import { ModuleView, type ViewId } from "@/components/modules";

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
    ],
  },
  {
    label: "Pengawasan",
    items: [
      { label: "Laporan", icon: BarChart3, view: "reports" },
      { label: "Riwayat stok", icon: History, view: "history" },
      { label: "Pengguna & role", icon: Users, view: "users" },
    ],
  },
];

const kpis = [
  {
    label: "Total stok tersedia",
    value: "128,4 kg",
    detail: "dari 167 unit fisik",
    trend: "+4,8%",
    positive: true,
    icon: Weight,
    tone: "lime",
  },
  {
    label: "Unit tersedia",
    value: "155",
    detail: "93% dari total unit",
    trend: "+8 unit",
    positive: true,
    icon: Boxes,
    tone: "blue",
  },
  {
    label: "Sedang digunakan",
    value: "12",
    detail: "oleh 8 operator",
    trend: "3 baru",
    positive: true,
    icon: ScanBarcode,
    tone: "violet",
  },
  {
    label: "Hampir habis",
    value: "9",
    detail: "perlu perhatian",
    trend: "+2 unit",
    positive: false,
    icon: AlertTriangle,
    tone: "orange",
  },
];

const usageBreakdown = [
  { label: "Kelas", value: "8,24 kg", cost: "Rp1.442.000", width: 74, color: "#b9ef3a" },
  { label: "Trial Print", value: "2,18 kg", cost: "Rp381.500", width: 42, color: "#6979f8" },
  { label: "Sample", value: "1,06 kg", cost: "Rp185.500", width: 26, color: "#f4a261" },
];

const lowStock = [
  { code: "FLM-2608-0142", name: "Bambu Lab PLA Basic", meta: "PLA · Matte Black", grams: 148, color: "#242528" },
  { code: "FLM-2608-0098", name: "eSUN PETG+HS", meta: "PETG · Fire Engine Red", grams: 236, color: "#d84a4a" },
  { code: "FLM-2607-0211", name: "Polymaker PolyTerra", meta: "PLA · Muted White", grams: 381, color: "#dedbd2" },
];

const activeUsage = [
  { id: "USE-260901-012", person: "Operator Demo 1", type: "Kelas", units: 2, elapsed: "42 menit", initials: "O1" },
  { id: "USE-260901-011", person: "Operator Demo 2", type: "Trial Print", units: 1, elapsed: "1j 18m", initials: "O2" },
  { id: "USE-260901-009", person: "Operator Demo 3", type: "Sample", units: 3, elapsed: "2j 06m", initials: "O3" },
];

const activity = [
  { icon: CheckCircle2, title: "Penggunaan selesai", text: "USE-260901-008 · 184,50 g", person: "Operator Demo 4", time: "10:42", tone: "green" },
  { icon: PackagePlus, title: "Barang masuk difinalisasi", text: "RCV-260901-003 · 8 unit", person: "Admin Demo", time: "09:56", tone: "blue" },
  { icon: ScanBarcode, title: "Unit mulai digunakan", text: "FLM-2608-0148 · PLA Basic", person: "Operator Demo 2", time: "09:18", tone: "violet" },
  { icon: AlertTriangle, title: "Stok melewati batas minimum", text: "FLM-2608-0142 · sisa 148 g", person: "Sistem", time: "08:51", tone: "orange" },
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

function Sidebar({ open, activeView, onClose, onSelect }: { open: boolean; activeView: ViewId; onClose: () => void; onSelect: (view: ViewId) => void }) {
  return (
    <>
      <div className={`sidebar-backdrop ${open ? "show" : ""}`} onClick={onClose} aria-hidden="true" />
      <aside className={`sidebar ${open ? "open" : ""}`}>
        <div className="sidebar-top">
          <Logo />
          <button className="icon-button sidebar-close" onClick={onClose} aria-label="Tutup menu">
            <X size={20} />
          </button>
        </div>

        <nav className="main-nav" aria-label="Navigasi utama">
          {navigation.map((group) => (
            <div className="nav-group" key={group.label}>
              <p>{group.label}</p>
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <button className={`nav-item ${activeView === item.view ? "active" : ""}`} key={item.label} type="button" onClick={() => onSelect(item.view)}>
                    <Icon size={18} strokeWidth={1.8} />
                    <span>{item.label}</span>
                    {item.count ? <em>{item.count}</em> : null}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <button className={`nav-item ${activeView === "settings" ? "active" : ""}`} type="button" onClick={() => onSelect("settings")}>
            <Settings size={18} strokeWidth={1.8} />
            <span>Pengaturan</span>
          </button>
          <div className="storage-card">
            <div className="storage-card-head">
              <span>Stok sehat</span>
              <strong>91%</strong>
            </div>
            <div className="storage-bar"><i /></div>
            <small>9 unit perlu perhatian</small>
          </div>
        </div>
      </aside>
    </>
  );
}

function ScannerDialog({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="dialog-layer" role="presentation" onMouseDown={(event) => event.currentTarget === event.target && onClose()}>
      <section className="scan-dialog" role="dialog" aria-modal="true" aria-labelledby="scan-title">
        <div className="dialog-head">
          <div>
            <span className="eyebrow">PENGGUNAAN BARU</span>
            <h2 id="scan-title">Scan barcode filamen</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Tutup pemindai"><X size={20} /></button>
        </div>
        <div className="scan-target">
          <span className="corner top-left" />
          <span className="corner top-right" />
          <span className="corner bottom-left" />
          <span className="corner bottom-right" />
          <ScanLine size={52} strokeWidth={1.4} />
          <strong>Scanner siap</strong>
          <p>Arahkan scanner USB atau ketik kode unit secara manual.</p>
        </div>
        <label className="manual-code">
          <span>Kode barcode unit</span>
          <div>
            <input autoFocus placeholder="Contoh: FLM-2608-0142" />
            <button type="button">Cari unit</button>
          </div>
        </label>
        <p className="dialog-note"><CheckCircle2 size={16} /> Scanner USB akan terbaca otomatis setelah menekan Enter.</p>
      </section>
    </div>
  );
}

export default function Home() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [view, setView] = useState<ViewId>("dashboard");
  const selectView = (nextView: ViewId) => {
    setView(nextView);
    setMenuOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="app-shell">
      <Sidebar open={menuOpen} activeView={view} onClose={() => setMenuOpen(false)} onSelect={selectView} />

      <div className="content-shell">
        <header className="topbar">
          <div className="topbar-start">
            <button className="icon-button menu-button" onClick={() => setMenuOpen(true)} aria-label="Buka menu">
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
            <button className="icon-button notification" aria-label="Notifikasi"><Bell size={19} /><i /></button>
            <div className="divider" />
            <button className="profile-button" type="button">
              <span className="avatar">FE</span>
              <span className="profile-copy"><strong>Admin TIDIGO</strong><small>Super Admin</small></span>
              <ChevronDown size={16} />
            </button>
          </div>
        </header>

        <main className="dashboard">
          {view === "dashboard" ? <>
          <div className="page-heading">
            <div>
              <span className="eyebrow">SELASA, 1 SEPTEMBER 2026</span>
              <h1>Selamat pagi, Admin.</h1>
              <p>Berikut kondisi persediaan filamen TIDIGO hari ini.</p>
            </div>
            <div className="heading-actions">
              <button className="button secondary" type="button" onClick={() => selectView("receipt")}><ReceiptText size={17} /> Barang masuk</button>
              <button className="button primary" type="button" onClick={() => setScanOpen(true)}><ScanLine size={18} /> Mulai penggunaan</button>
            </div>
          </div>

          <section className="kpi-grid" aria-label="Ringkasan stok">
            {kpis.map((kpi) => {
              const Icon = kpi.icon;
              return (
                <article className="kpi-card" key={kpi.label}>
                  <div className={`kpi-icon ${kpi.tone}`}><Icon size={21} strokeWidth={1.8} /></div>
                  <span>{kpi.label}</span>
                  <div className="kpi-value-row">
                    <strong>{kpi.value}</strong>
                    <em className={kpi.positive ? "positive" : "negative"}>
                      {kpi.positive ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                      {kpi.trend}
                    </em>
                  </div>
                  <small>{kpi.detail}</small>
                </article>
              );
            })}
          </section>

          <div className="dashboard-grid">
            <section className="panel usage-panel">
              <div className="panel-head">
                <div><h2>Penggunaan bulan ini</h2><p>1–30 September 2026</p></div>
                <button className="text-button" type="button" onClick={() => selectView("reports")}>Lihat laporan <ArrowUpRight size={15} /></button>
              </div>
              <div className="usage-summary">
                <div><span>Total penggunaan</span><strong>11,48 kg</strong><small><ArrowUpRight size={13} /> 12,6% dari Agustus</small></div>
                <div><span>Total biaya</span><strong>Rp2.009.000</strong><small>65 transaksi selesai</small></div>
              </div>
              <div className="usage-bars">
                {usageBreakdown.map((item) => (
                  <div className="usage-row" key={item.label}>
                    <div className="usage-label"><i style={{ background: item.color }} /><span>{item.label}</span><strong>{item.value}</strong></div>
                    <div className="bar-track"><i style={{ width: `${item.width}%`, background: item.color }} /></div>
                    <small>{item.cost}</small>
                  </div>
                ))}
              </div>
            </section>

            <section className="panel attention-panel">
              <div className="panel-head">
                <div><h2>Perlu perhatian</h2><p>Stok di bawah 500 gram</p></div>
                <span className="count-badge">9 unit</span>
              </div>
              <div className="stock-list">
                {lowStock.map((item) => (
                  <button className="stock-item" type="button" key={item.code}>
                    <i className="spool-dot" style={{ background: item.color }} />
                    <span className="stock-copy"><strong>{item.name}</strong><small>{item.code} · {item.meta}</small></span>
                    <span className="gram"><strong>{item.grams}</strong><small>gram</small></span>
                  </button>
                ))}
              </div>
              <button className="panel-footer-link" type="button" onClick={() => selectView("inventory")}>Lihat semua filamen hampir habis <ArrowUpRight size={15} /></button>
            </section>

            <section className="panel active-panel">
              <div className="panel-head">
                <div><h2>Penggunaan aktif</h2><p>12 unit sedang berada di luar penyimpanan</p></div>
                <button className="icon-button" aria-label="Opsi penggunaan aktif"><MoreHorizontal size={20} /></button>
              </div>
              <div className="active-list">
                {activeUsage.map((item) => (
                  <button className="active-item" type="button" key={item.id}>
                    <span className="avatar soft">{item.initials}</span>
                    <span className="active-person"><strong>{item.person}</strong><small>{item.id} · {item.type}</small></span>
                    <span className="unit-chip">{item.units} unit</span>
                    <span className="elapsed"><Clock3 size={14} /> {item.elapsed}</span>
                  </button>
                ))}
              </div>
              <button className="panel-footer-link" type="button" onClick={() => selectView("usage-active")}>Buka daftar penggunaan aktif <ArrowUpRight size={15} /></button>
            </section>

            <section className="panel activity-panel">
              <div className="panel-head">
                <div><h2>Aktivitas terbaru</h2><p>Perubahan stok hari ini</p></div>
                <button className="text-button" type="button" onClick={() => selectView("history")}>Audit log</button>
              </div>
              <div className="timeline">
                {activity.map((item) => {
                  const Icon = item.icon;
                  return (
                    <div className="timeline-item" key={`${item.time}-${item.title}`}>
                      <span className={`timeline-icon ${item.tone}`}><Icon size={16} /></span>
                      <span className="timeline-copy"><strong>{item.title}</strong><small>{item.text} · {item.person}</small></span>
                      <time>{item.time}</time>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
          </> : <ModuleView view={view} onNavigate={selectView} />}
        </main>
      </div>

      <button className="mobile-scan" onClick={() => setScanOpen(true)} aria-label="Mulai scan barcode"><Plus size={19} /><ScanBarcode size={21} /></button>
      {scanOpen ? <ScannerDialog onClose={() => setScanOpen(false)} /> : null}
    </div>
  );
}

