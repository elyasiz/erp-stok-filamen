"use client";

import { AlertTriangle, ArrowUpRight, Boxes, CheckCircle2, Clock3, PackagePlus, ReceiptText, ScanBarcode, ScanLine, Weight } from "lucide-react";
import { filterReportPeriod, usageTotals } from "@/lib/report-data";
import type { ViewId } from "./modules";
import { formatDate, formatKg, formatMoney, formatNumber, ReportLoadState, ReportRefresh, type ReportState } from "./report-state";

export default function DashboardView({ state, onNavigate }: { state: ReportState; onNavigate: (view: ViewId, sessionId?: string) => void }) {
  const data = state.data;
  if (!data || state.loading) return <ReportLoadState state={state} />;
  const period = filterReportPeriod(data, data.currentMonth);
  const totals = usageTotals(period.usages);
  const monthLabel = new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", month: "long", year: "numeric" }).format(new Date(data.generatedAt));
  const kpis = [
    { label: "Total sisa stok", value: formatKg(data.summary.totalGrams), detail: `${data.summary.totalUnits} unit · ${formatNumber(data.summary.totalGrams)} gram`, icon: Weight, tone: "lime" },
    { label: "Unit tersedia", value: formatNumber(data.summary.available), detail: "unit berstatus Tersedia", icon: Boxes, tone: "blue" },
    { label: "Sedang digunakan", value: formatNumber(data.summary.inUse), detail: `${data.activeSessions.length} sesi penggunaan aktif`, icon: ScanBarcode, tone: "violet" },
    { label: "Hampir habis", value: formatNumber(data.summary.lowStock), detail: "sisa lebih dari 0 dan di bawah 500 gram", icon: AlertTriangle, tone: "orange" },
  ];
  return <>
    <div className="page-heading">
      <div><span className="eyebrow">{new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(data.generatedAt)).toUpperCase()}</span><h1>Dashboard filamen</h1><p>Persediaan dan penggunaan dari data yang tersimpan.</p></div>
      <div className="heading-actions"><ReportRefresh state={state} /><button className="button secondary" onClick={() => onNavigate("receipt")}><ReceiptText size={17} /> Barang masuk</button><button className="button primary" onClick={() => onNavigate("usage-start")}><ScanLine size={18} /> Mulai penggunaan</button></div>
    </div>
    <section className="kpi-grid" aria-label="Ringkasan stok">{kpis.map(({ icon: Icon, ...kpi }) => <article className="kpi-card" key={kpi.label}><div className={`kpi-icon ${kpi.tone}`}><Icon size={21} /></div><span>{kpi.label}</span><div className="kpi-value-row"><strong>{kpi.value}</strong></div><small>{kpi.detail}</small></article>)}</section>
    <div className="dashboard-grid">
      <section className="panel usage-panel">
        <div className="panel-head"><div><h2>Penggunaan bulan ini</h2><p>{monthLabel} · sesi selesai</p></div><button className="text-button" onClick={() => onNavigate("reports")}>Lihat laporan <ArrowUpRight size={15} /></button></div>
        <div className="usage-summary"><div><span>Total penggunaan</span><strong>{formatKg(totals.grams)}</strong><small>{formatNumber(totals.grams)} gram tercatat</small></div><div><span>Estimasi biaya penggunaan</span><strong>{formatMoney(totals.estimatedCost)}</strong><small>{totals.count} sesi selesai</small></div></div>
        <div className="usage-bars">{[{ label: "Kelas", color: "#b9ef3a" }, { label: "Trial Print", color: "#6979f8" }, { label: "Sample", color: "#f4a261" }].map((category) => {
          const group = usageTotals(period.usages.filter((item) => item.category === category.label));
          return <div className="usage-row" key={category.label}><div className="usage-label"><i style={{ background: category.color }} /><span>{category.label}</span><strong>{formatKg(group.grams)}</strong></div><div className="bar-track"><i style={{ width: `${totals.grams ? group.grams / totals.grams * 100 : 0}%`, background: category.color }} /></div><small>{formatMoney(group.estimatedCost)}</small></div>;
        })}</div>
        {!totals.count ? <p className="report-note">Belum ada penggunaan selesai pada bulan ini.</p> : null}
        <p className="report-note">Biaya dihitung dari harga unit dan berat awal penerimaan.{totals.incompleteCostCount ? ` Data biaya untuk ${totals.incompleteCostCount} sesi belum lengkap.` : ""}</p>
      </section>
      <section className="panel attention-panel">
        <div className="panel-head"><div><h2>Perlu perhatian</h2><p>Stok di bawah 500 gram</p></div><span className="count-badge">{data.lowStock.length} unit</span></div>
        <div className="stock-list">{data.lowStock.slice(0, 4).map((item) => <button className="stock-item" key={item.id} onClick={() => onNavigate("inventory")}><Weight size={20} /><span className="stock-copy"><strong>{item.product}</strong><small>{item.code} · {item.material} · {item.color}</small></span><span className="gram"><strong>{formatNumber(item.remainingGrams)}</strong><small>gram</small></span></button>)}{!data.lowStock.length ? <p className="report-empty">Tidak ada unit dengan sisa di bawah 500 gram.</p> : null}</div>
        <button className="panel-footer-link" onClick={() => onNavigate("inventory")}>Lihat stok filamen <ArrowUpRight size={15} /></button>
      </section>
      <section className="panel active-panel">
        <div className="panel-head"><div><h2>Penggunaan aktif</h2><p>{data.activeSessions.length} sesi · {data.activeSessions.reduce((sum, item) => sum + item.unitCount, 0)} unit dalam sesi aktif</p></div></div>
        <div className="active-list">{data.activeSessions.slice(0, 4).map((item) => <button className="active-item" key={item.id} onClick={() => onNavigate("usage-complete", item.id)}><span className="avatar soft">{item.userName.split(/\s+/).map((word) => word[0]).slice(0, 2).join("").toUpperCase()}</span><span className="active-person"><strong>{item.userName}</strong><small>{item.number} · {item.category}</small></span><span className="unit-chip">{item.unitCount} unit</span><span className="elapsed"><Clock3 size={14} />{Math.max(0, Math.floor((new Date(data.generatedAt).getTime() - new Date(item.startedAt).getTime()) / 60_000)).toLocaleString("id-ID")} menit</span></button>)}{!data.activeSessions.length ? <p className="report-empty">Belum ada penggunaan aktif.</p> : null}</div>
        <button className="panel-footer-link" onClick={() => onNavigate("usage-active")}>Buka daftar penggunaan aktif <ArrowUpRight size={15} /></button>
      </section>
      <section className="panel activity-panel">
        <div className="panel-head"><div><h2>Aktivitas terbaru</h2><p>Penerimaan dan sesi penggunaan tersimpan</p></div><button className="text-button" onClick={() => onNavigate("history")}>Riwayat stok</button></div>
        <div className="timeline">{data.activities.slice(0, 5).map((item) => { const Icon = item.kind === "receipt" ? PackagePlus : item.kind === "complete" ? CheckCircle2 : ScanBarcode; return <div className="timeline-item" key={item.id}><span className={`timeline-icon ${item.kind === "receipt" ? "blue" : item.kind === "complete" ? "green" : "violet"}`}><Icon size={16} /></span><span className="timeline-copy"><strong>{item.title}</strong><small>{item.detail} · {item.person}</small></span><time dateTime={item.time}>{formatDate(item.time)}</time></div>; })}{!data.activities.length ? <p className="report-empty">Belum ada aktivitas tercatat.</p> : null}</div>
      </section>
    </div>
    <p className="report-updated">Diperbarui {formatDate(data.generatedAt)} WIB</p>
  </>;
}
