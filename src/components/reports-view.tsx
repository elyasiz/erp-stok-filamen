"use client";

import { Download, Eye, History, PackagePlus, ScanBarcode, Search, Weight } from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";
import { filterReportPeriod, filterUsageHistory, resultLabels, sessionStatusLabels, stockStatusLabels, toCsv, usageTotals } from "@/lib/report-data";
import { formatDate, formatKg, formatMoney, formatNumber, ReportLoadState, ReportRefresh, type ReportState } from "./report-state";
import UsageHistoryDetail from "./usage-history-detail";

type ReportKind = "inventory" | "usages" | "receipts" | "movements";
function Table({ headers, rows }: { headers: string[]; rows: ReactNode[][] }) {
  return <div className="table-wrap" tabIndex={0} role="region" aria-label="Tabel laporan"><table className="data-table"><thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{rows.length ? rows.map((row, index) => <tr key={index}>{row.map((value, cell) => <td key={cell}>{value}</td>)}</tr>) : <tr><td colSpan={headers.length}><div className="report-empty">Belum ada data untuk pilihan ini.</div></td></tr>}</tbody></table></div>;
}

export default function ReportsView({ state, ledgerOnly = false }: { state: ReportState; ledgerOnly?: boolean }) {
  const [selected, setSelected] = useState<ReportKind>("inventory");
  const [month, setMonth] = useState("");
  const [movementType, setMovementType] = useState("");
  const [usageName, setUsageName] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [dateBasis, setDateBasis] = useState<"started" | "completed">("started");
  const [detailSessionId, setDetailSessionId] = useState<string | null>(null);
  const kind = ledgerOnly ? "movements" : selected;
  const data = state.data;
  if (!data) return <ReportLoadState state={state} />;
  const period = filterReportPeriod(data, month);
  const movements = period.movements.filter((item) => !movementType || item.type === movementType);
  const usages = filterUsageHistory(data.usages, { name: usageName, from: dateFrom, to: dateTo, dateBasis, month });
  const invalidDateRange = Boolean(dateFrom && dateTo && dateFrom > dateTo);
  const detailSession = data.usages.find((item) => item.id === detailSessionId);
  const totals = usageTotals(usages);
  const selectMonth = (value: string) => { setMonth(value); setDateFrom(""); setDateTo(""); };
  const finalized = period.receipts.filter((item) => item.status === "FINALIZED");
  const cards = [
    { kind: "inventory" as const, title: "Stok saat ini", stat: `${data.summary.totalUnits} unit · ${formatKg(data.summary.totalGrams)}`, icon: Weight, description: "Sisa gram dan harga unit terkini" },
    { kind: "usages" as const, title: "Penggunaan", stat: `${totals.count} sesi selesai · ${formatKg(totals.grams)}`, icon: ScanBarcode, description: `${usages.filter((item) => item.status === "ACTIVE").length} sesi aktif sesuai filter` },
    { kind: "receipts" as const, title: "Barang masuk", stat: `${finalized.length} penerimaan final`, icon: PackagePlus, description: `${period.receipts.length - finalized.length} draft · ${finalized.reduce((sum, item) => sum + item.unitCount, 0)} unit diterima` },
    { kind: "movements" as const, title: "Pergerakan stok", stat: `${period.movements.length} pergerakan tercatat`, icon: History, description: "Penerimaan final dan penggunaan selesai" },
  ];
  const title = cards.find((card) => card.kind === kind)!.title;
  const usageHeaders = ["Referensi", "Nama pengambil", "Jenis", "Status", "Mulai (WIB)", "Selesai (WIB)", "Unit", "Gram awal", "Gram digunakan", "Gram kembali", "Estimasi biaya (Rp)", "Hasil", "Catatan"];
  const inventoryHeaders = ["Kode unit", "Produk", "Material", "Warna", "Kemasan", "Sisa (g)", "Status", "Harga unit (Rp)", "Supplier"];
  const receiptHeaders = ["Referensi", "Supplier", "Invoice", "Tgl pembelian", "Tgl diterima", "Status", "Unit", "Berat (g)", "Subtotal (Rp)", "Diskon (Rp)", "Pajak (Rp)", "Ongkir (Rp)", "Total penerimaan (Rp)"];
  const movementHeaders = ["Waktu (WIB)", "Kode unit", "Jenis", "Referensi", "Perubahan (g)", "Saldo sebelum (g)", "Saldo setelah (g)", "Pengambil"];
  const movementDate = (item: typeof movements[number]) => formatDate(item.time, item.type !== "Barang masuk");

  const downloadCsv = (report: ReportKind) => {
    let rows: Array<Array<string | number | null>>;
    if (report === "inventory") rows = [inventoryHeaders, ...data.inventory.map((item) => [item.code, item.product, item.material, item.color, item.packagingType === "WITH_SPOOL" ? "With Spool" : "Refill", item.remainingGrams, stockStatusLabels[item.status] ?? item.status, item.unitCost, item.supplier])];
    else if (report === "usages") rows = [usageHeaders, ...usages.map((item) => [item.number, item.userName, item.category, sessionStatusLabels[item.status] ?? item.status, formatDate(item.startedAt), item.completedAt ? formatDate(item.completedAt) : null, item.unitCount, item.totalStartingGrams, item.totalUsedGrams, item.totalReturnedGrams, item.estimatedCost, item.result ? resultLabels[item.result] : null, item.notes])];
    else if (report === "receipts") rows = [receiptHeaders, ...period.receipts.map((item) => [item.number, item.supplier, item.invoiceNumber, item.purchaseDate, item.receivedDate, item.status === "FINALIZED" ? "Final" : "Draft", item.unitCount, item.totalGrams, item.subtotal, item.discount, item.tax, item.shipping, item.total])];
    else rows = [movementHeaders, ...movements.map((item) => [movementDate(item), item.code, item.type, item.reference, item.change, item.before, item.after, item.user])];
    const url = URL.createObjectURL(new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${report}-tidigo-${report === "inventory" ? data.today : month || (report === "usages" && (dateFrom || dateTo) ? `${dateFrom || "awal"}-sd-${dateTo || "akhir"}` : "semua-periode")}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return <>
    <div className="module-heading"><div><span className="eyebrow">{ledgerOnly ? "INVENTORY · RIWAYAT" : "PELAPORAN"}</span><h1>{ledgerOnly ? "Riwayat pergerakan stok" : "Laporan"}</h1><p>Data stok, penerimaan, dan penggunaan yang tersimpan.</p></div><div className="heading-actions"><ReportRefresh state={state} /><button className="button secondary" disabled={kind === "usages" && invalidDateRange} onClick={() => downloadCsv(kind)}><Download size={17} /> Ekspor {title}</button></div></div>
    <div className="report-period"><label>Periode transaksi <input type="month" value={month} onChange={(event) => selectMonth(event.target.value)} aria-label="Bulan laporan" /></label><button className="button secondary" onClick={() => selectMonth(data.currentMonth)}>Bulan ini</button><button className="button secondary" onClick={() => selectMonth("")}>Semua periode</button><small>{kind === "usages" && (dateFrom || dateTo) ? "Rentang tanggal khusus" : month || "Semua periode"} · Stok selalu menunjukkan kondisi terkini.</small></div>
    {!ledgerOnly ? <section className="report-grid">{cards.map(({ icon: Icon, ...card }) => <article className={`report-card ${kind === card.kind ? "selected" : ""}`} key={card.kind}><span className="report-icon"><Icon size={21} /></span><div><h2>{card.title}</h2><strong>{card.stat}</strong><p>{card.description}</p></div><button aria-pressed={kind === card.kind} onClick={() => setSelected(card.kind)}>Lihat {card.title.toLowerCase()}</button><button disabled={card.kind === "usages" && invalidDateRange} onClick={() => downloadCsv(card.kind)}><Download size={15} /> CSV</button></article>)}</section> : null}
    <section className="data-panel ledger-panel">
      <div className="toolbar"><div><strong>{title}</strong><small>{kind === "inventory" ? `Kondisi pada ${formatDate(data.generatedAt)} WIB` : kind === "usages" && (dateFrom || dateTo) ? `${dateFrom || "Awal catatan"} s.d. ${dateTo || "Terbaru"}` : month ? `Periode ${month}` : "Semua periode"}</small></div>{kind === "movements" ? <label className="toolbar-select"><select value={movementType} onChange={(event) => setMovementType(event.target.value)} aria-label="Jenis pergerakan"><option value="">Semua jenis</option><option>Barang masuk</option><option>Penggunaan</option></select></label> : null}</div>
      {kind === "inventory" ? <Table headers={inventoryHeaders} rows={data.inventory.map((item) => [item.code, item.product, item.material, item.color, item.packagingType === "WITH_SPOOL" ? "With Spool" : "Refill", formatNumber(item.remainingGrams), stockStatusLabels[item.status] ?? item.status, formatMoney(item.unitCost), item.supplier])} /> : null}
      {kind === "usages" ? <>
        <div className="usage-history-filters">
          <label className="usage-history-name"><span>Nama pengambil</span><div><Search size={16} /><input type="search" value={usageName} onChange={(event) => setUsageName(event.target.value)} placeholder="Cari nama pengambil..." /></div></label>
          <label><span>Tanggal acuan (WIB)</span><select value={dateBasis} onChange={(event) => setDateBasis(event.target.value as "started" | "completed")}><option value="started">Tanggal mulai</option><option value="completed">Tanggal selesai</option></select></label>
          <label><span>Dari tanggal</span><input type="date" value={dateFrom} max={dateTo || undefined} aria-invalid={invalidDateRange} aria-describedby={invalidDateRange ? "usage-date-error" : undefined} onChange={(event) => { setDateFrom(event.target.value); setMonth(""); }} /></label>
          <label><span>Sampai tanggal</span><input type="date" value={dateTo} min={dateFrom || undefined} aria-invalid={invalidDateRange} aria-describedby={invalidDateRange ? "usage-date-error" : undefined} onChange={(event) => { setDateTo(event.target.value); setMonth(""); }} /></label>
          <button className="button secondary" onClick={() => { setUsageName(""); selectMonth(""); setDateBasis("started"); }}>Reset filter</button>
        </div>
        {invalidDateRange ? <p className="inventory-form-error" id="usage-date-error" role="alert">Tanggal akhir harus sama dengan atau setelah tanggal awal.</p> : null}
        <p className="report-note" role="status">{usages.length} sesi ditemukan · Filter bulan dan rentang tanggal mengikuti {dateBasis === "started" ? "tanggal mulai" : "tanggal selesai"} (WIB).{dateBasis === "completed" ? " Sesi yang belum selesai tidak ditampilkan." : ""}</p>
        <div className="usage-summary"><div><span>Penggunaan selesai sesuai filter</span><strong>{formatKg(totals.grams)}</strong><small>{totals.count} sesi selesai</small></div><div><span>Estimasi biaya penggunaan</span><strong>{formatMoney(totals.estimatedCost)}</strong><small>Berdasarkan harga unit dan berat awal penerimaan</small></div></div>
        <Table headers={["Detail", "Referensi", "Nama pengambil", "Jenis", "Status", "Mulai (WIB)", "Selesai (WIB)", "Unit", "Gram digunakan", "Hasil"]} rows={usages.map((item) => [
          <button key="detail" className="button secondary usage-history-open" onClick={() => setDetailSessionId(item.id)} aria-label={`Lihat detail ${item.number} oleh ${item.userName}`}><Eye size={15} /> Detail</button>,
          item.number, item.userName, item.category, sessionStatusLabels[item.status] ?? item.status,
          formatDate(item.startedAt), item.completedAt ? formatDate(item.completedAt) : "Belum selesai", item.unitCount,
          item.totalUsedGrams === null ? "—" : formatNumber(item.totalUsedGrams), item.result ? resultLabels[item.result] : "—",
        ])} />
        <p className="report-note">Buka Detail untuk melihat produk, barcode, gram per unit, hasil, dan catatan. CSV ringkasan mengikuti filter nama dan tanggal yang dipilih.{totals.incompleteCostCount ? ` ${totals.incompleteCostCount} sesi memiliki data biaya belum lengkap.` : ""}</p>
      </> : null}
      {kind === "receipts" ? <><div className="usage-summary"><div><span>Total penerimaan final</span><strong>{formatMoney(finalized.reduce((sum, item) => sum + item.total, 0))}</strong><small>Draft tidak termasuk total penerimaan final</small></div><div><span>Berat diterima</span><strong>{formatKg(finalized.reduce((sum, item) => sum + item.totalGrams, 0))}</strong><small>{finalized.reduce((sum, item) => sum + item.unitCount, 0)} unit</small></div></div><Table headers={receiptHeaders} rows={period.receipts.map((item) => [item.number, item.supplier, item.invoiceNumber, item.purchaseDate, item.receivedDate, item.status === "FINALIZED" ? "Final" : "Draft", item.unitCount, formatNumber(item.totalGrams), formatMoney(item.subtotal), formatMoney(item.discount), formatMoney(item.tax), formatMoney(item.shipping), formatMoney(item.total)])} /></> : null}
      {kind === "movements" ? <><Table headers={movementHeaders} rows={movements.map((item) => [movementDate(item), item.code, item.type, item.reference, <span key="change" className={item.change > 0 ? "positive-copy" : item.change < 0 ? "negative-copy" : ""}>{item.change > 0 ? "+" : ""}{formatNumber(item.change)}</span>, formatNumber(item.before), formatNumber(item.after), item.user ?? "Tidak tercatat"])} /><p className="report-note">Riwayat berasal dari penerimaan final untuk unit yang masih tercatat dan penggunaan selesai. Penambahan, perubahan, atau penghapusan stok manual belum memiliki catatan pergerakan. Tanggal barang masuk mengikuti tanggal diterima.</p></> : null}
    </section>
    <p className="report-updated">Diperbarui {formatDate(data.generatedAt)} WIB · CSV mengikuti laporan dan filter yang dipilih.</p>
    {kind === "usages" && detailSession ? <UsageHistoryDetail key={detailSession.id} session={detailSession} onClose={() => setDetailSessionId(null)} /> : null}
  </>;
}
