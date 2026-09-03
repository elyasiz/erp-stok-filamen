"use client";

import { Download, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { resultLabels, sessionStatusLabels, toCsv, type ReportsData } from "@/lib/report-data";
import { formatDate, formatMoney, formatNumber } from "./report-state";

type UsageSession = ReportsData["usages"][number];
const grams = (value: number | null) => value === null ? "Belum tercatat" : `${formatNumber(value)} g`;
const packaging = (value: string | null) => value === "WITH_SPOOL" ? "With Spool" : value === "REFILL" ? "Refill" : "Tidak tercatat";

export default function UsageHistoryDetail({ session, onClose }: { session: UsageSession; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    const previousOverflow = document.body.style.overflow;
    dialog?.showModal();
    document.body.style.overflow = "hidden";
    return () => { dialog?.close(); document.body.style.overflow = previousOverflow; };
  }, []);

  const downloadDetail = () => {
    const rows: Array<Array<string | number | null>> = [
      ["Referensi", "Nama pengambil", "Jenis penggunaan", "Status sesi", "Mulai (WIB)", "Selesai (WIB)", "Hasil", "Catatan", "Kode unit", "Produk", "Material", "Warna", "Kemasan", "Supplier", "Gram awal sesi", "Gram digunakan", "Sisa setelah sesi (g)", "Estimasi biaya (Rp)"],
      ...session.items.map((item) => [session.number, session.userName, session.category, sessionStatusLabels[session.status] ?? session.status, formatDate(session.startedAt), session.completedAt ? formatDate(session.completedAt) : null, session.result ? resultLabels[session.result] : null, session.notes, item.code, item.product, item.material, item.color, packaging(item.packagingType), item.supplier, item.startingGrams, item.usedGrams, item.returnedGrams, item.estimatedCost]),
    ];
    const url = URL.createObjectURL(new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `detail-${session.number}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <dialog ref={dialogRef} className="usage-history-dialog" aria-labelledby="usage-history-title" onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => {
      if (event.target !== event.currentTarget) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
    }}>
      <div className="usage-history-dialog-body">
        <div className="dialog-head">
          <div><span className="eyebrow">DETAIL PENGGUNAAN</span><h2 id="usage-history-title">{session.number}</h2><p>Rincian penggunaan oleh {session.userName}.</p></div>
          <button className="icon-button" type="button" autoFocus onClick={onClose} aria-label="Tutup detail penggunaan"><X size={20} /></button>
        </div>

        <dl className="usage-history-metadata">
          <div><dt>Nama pengambil</dt><dd>{session.userName}</dd></div>
          <div><dt>Kelas / kegiatan</dt><dd>{session.activityName || "Tidak tercatat"}</dd></div>
          <div><dt>Dicatat oleh</dt><dd>{session.createdByName || "Tidak tercatat (data lama)"}</dd></div>
          <div><dt>Diselesaikan oleh</dt><dd>{session.completedByName || "Belum tercatat"}</dd></div>
          <div><dt>Jenis penggunaan</dt><dd>{session.category}</dd></div>
          <div><dt>Status sesi</dt><dd>{sessionStatusLabels[session.status] ?? session.status}</dd></div>
          <div><dt>Jumlah unit</dt><dd>{session.unitCount} unit</dd></div>
          <div><dt>Mulai (WIB)</dt><dd>{formatDate(session.startedAt)}</dd></div>
          <div><dt>Selesai (WIB)</dt><dd>{session.completedAt ? formatDate(session.completedAt) : "Belum selesai"}</dd></div>
          <div><dt>Hasil pekerjaan</dt><dd>{session.result ? resultLabels[session.result] ?? session.result : "Belum tercatat"}</dd></div>
          <div><dt>Estimasi biaya sesi</dt><dd>{session.status === "COMPLETED" ? formatMoney(session.estimatedCost) : "Belum selesai"}</dd></div>
        </dl>

        <div className="usage-history-totals">
          <div><span>Total gram awal sesi</span><strong>{grams(session.totalStartingGrams)}</strong></div>
          <div><span>Total gram digunakan</span><strong>{grams(session.totalUsedGrams)}</strong></div>
          <div><span>Total sisa setelah sesi</span><strong>{grams(session.totalReturnedGrams)}</strong></div>
        </div>

        <section aria-labelledby="usage-history-items-title">
          <h3 id="usage-history-items-title">Filamen yang digunakan</h3>
          <div className="table-wrap">
            <table className="data-table usage-history-items">
              <thead><tr><th>Filamen</th><th>Barcode unit</th><th>Kemasan / supplier</th><th>Gram awal</th><th>Gram digunakan</th><th>Sisa setelah sesi</th><th>Estimasi biaya</th></tr></thead>
              <tbody>{session.items.map((item) => (
                <tr key={item.inventoryItemId}>
                  <td><strong>{item.product ?? "Produk tidak tercatat"}</strong><small>{item.material ?? "—"} · {item.color ?? "—"}</small></td>
                  <td><code>{item.code}</code></td>
                  <td>{packaging(item.packagingType)}<small>{item.supplier ?? "Supplier tidak tercatat"}</small></td>
                  <td>{grams(item.startingGrams)}</td><td>{grams(item.usedGrams)}</td><td>{grams(item.returnedGrams)}</td>
                  <td>{item.usedGrams === null ? "Belum tercatat" : formatMoney(item.estimatedCost)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <p className="report-note">Gram awal dan sisa setelah sesi berasal dari catatan sesi ini. Identitas filamen mengikuti data unit yang tersimpan. Estimasi biaya dihitung dari harga unit dan berat awal penerimaan.</p>
        </section>

        <section className="usage-history-notes" aria-labelledby="usage-history-notes-title"><h3 id="usage-history-notes-title">Catatan pekerjaan</h3><p>{session.notes || "Tidak ada catatan."}</p></section>
        <div className="dialog-actions"><button className="button secondary" type="button" onClick={downloadDetail}><Download size={17} /> Ekspor detail CSV</button><button className="button primary" type="button" onClick={onClose}>Tutup</button></div>
      </div>
    </dialog>
  );
}
