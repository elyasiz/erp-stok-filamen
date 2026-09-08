"use client";

import { AlertCircle, CheckCircle2, ClipboardPenLine, LoaderCircle, RefreshCw, XCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { formatDate, formatNumber } from "./report-state";

type Correction = {
  id: string; sessionId: string; sessionNumber: string; userName: string;
  status: "PENDING" | "APPROVED" | "REJECTED"; reason: string;
  requestedByName: string; reviewedByName: string | null; reviewNote: string;
  createdAt: string; reviewedAt: string | null;
  items: Array<{ inventoryItemId: string; code: string; product: string; color: string; beforeUsedGrams: number; afterUsedGrams: number; stockDeltaGrams: number }>;
};

const labels = { PENDING: "Menunggu", APPROVED: "Disetujui", REJECTED: "Ditolak" } as const;

export default function UsageCorrectionsView() {
  const [items, setItems] = useState<Correction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"PENDING" | "ALL">("PENDING");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { const response = await fetch("/api/v1/usage-corrections", { cache: "no-store" }); const body = await response.json(); if (!response.ok) throw new Error(body.message); setItems(body.corrections); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Daftar koreksi belum dapat dimuat."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  const review = async (correction: Correction, decision: "APPROVE" | "REJECT") => {
    const note = notes[correction.id]?.trim() ?? "";
    if (decision === "REJECT" && note.length < 3) { setError("Isi alasan penolakan minimal 3 karakter."); return; }
    setReviewing(correction.id); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/v1/usage-corrections/${encodeURIComponent(correction.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision, note }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.message ?? "Koreksi belum dapat ditinjau.");
      setNotice(decision === "APPROVE" ? `Koreksi ${correction.sessionNumber} diterapkan ke stok.` : `Koreksi ${correction.sessionNumber} ditolak.`);
      await load();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Koreksi belum dapat ditinjau."); }
    finally { setReviewing(null); }
  };
  const pending = items.filter((item) => item.status === "PENDING");
  const visible = filter === "PENDING" ? pending : items;
  return <div className="accounts-view usage-corrections-view">
    <div className="module-heading"><div><span className="eyebrow">PENGAWASAN</span><h1>Koreksi penggunaan</h1><p>Tinjau perubahan gram dan dampaknya pada saldo stok.</p></div><button className="button secondary" onClick={() => void load()} disabled={loading}><RefreshCw className={loading ? "spin" : ""} size={17} /> Muat ulang</button></div>
    <section className="module-stats"><article><span>Menunggu peninjauan</span><strong>{loading ? "—" : pending.length}</strong><small>Permintaan Operator</small></article><article><span>Sudah disetujui</span><strong>{loading ? "—" : items.filter((item) => item.status === "APPROVED").length}</strong><small>Stok telah disesuaikan</small></article><article><span>Ditolak</span><strong>{loading ? "—" : items.filter((item) => item.status === "REJECTED").length}</strong><small>Stok tidak berubah</small></article></section>
    <div className="correction-filter"><button className={`button ${filter === "PENDING" ? "primary" : "secondary"}`} onClick={() => setFilter("PENDING")}>Menunggu ({pending.length})</button><button className={`button ${filter === "ALL" ? "primary" : "secondary"}`} onClick={() => setFilter("ALL")}>Semua riwayat</button></div>
    {notice ? <div className="info-strip" role="status"><CheckCircle2 size={17} />{notice}</div> : null}
    {error ? <div className="inventory-form-error" role="alert"><AlertCircle size={17} />{error}</div> : null}
    {loading ? <div className="report-empty"><LoaderCircle className="spin" size={24} /> Memuat koreksi...</div> : visible.length ? <div className="correction-list">{visible.map((item) => <article className="correction-card" key={item.id}>
      <div className="correction-card-head"><div><span className={`status ${item.status === "APPROVED" ? "success" : item.status === "PENDING" ? "info" : "warning"}`}><i />{labels[item.status]}</span><h2>{item.sessionNumber}</h2><p>{item.userName} · diajukan {item.requestedByName} pada {formatDate(item.createdAt)}</p></div><ClipboardPenLine size={24} /></div>
      <p className="correction-reason"><strong>Alasan:</strong> {item.reason}</p>
      <div className="table-wrap" tabIndex={0} role="region" aria-label={`Rincian koreksi ${item.sessionNumber}`}><table className="data-table"><thead><tr><th>Filamen</th><th>Sebelumnya</th><th>Sebenarnya</th><th>Penyesuaian stok</th></tr></thead><tbody>{item.items.map((unit) => <tr key={unit.inventoryItemId}><td><strong>{unit.product} · {unit.color}</strong><small>{unit.code}</small></td><td>{formatNumber(unit.beforeUsedGrams)} g</td><td>{formatNumber(unit.afterUsedGrams)} g</td><td className={unit.stockDeltaGrams >= 0 ? "positive-copy" : "negative-copy"}>{unit.stockDeltaGrams > 0 ? "+" : ""}{formatNumber(unit.stockDeltaGrams)} g</td></tr>)}</tbody></table></div>
      {item.status === "PENDING" ? <><label className="stack-field"><span>Catatan peninjau</span><textarea maxLength={500} value={notes[item.id] ?? ""} disabled={reviewing === item.id} onChange={(event) => setNotes((current) => ({ ...current, [item.id]: event.target.value }))} placeholder="Wajib diisi jika menolak" /></label><div className="dialog-actions"><button className="button secondary danger" disabled={Boolean(reviewing)} onClick={() => void review(item, "REJECT")}><XCircle size={17} /> Tolak</button><button className="button primary" disabled={Boolean(reviewing)} onClick={() => void review(item, "APPROVE")}>{reviewing === item.id ? <LoaderCircle className="spin" size={17} /> : <CheckCircle2 size={17} />} Setujui & sesuaikan stok</button></div></> : <p className="correction-reviewed">Ditinjau oleh {item.reviewedByName ?? "—"}{item.reviewedAt ? ` · ${formatDate(item.reviewedAt)}` : ""}{item.reviewNote ? ` · ${item.reviewNote}` : ""}</p>}
    </article>)}</div> : <div className="report-empty"><CheckCircle2 size={24} />{filter === "PENDING" ? "Tidak ada koreksi yang menunggu." : "Belum ada riwayat koreksi."}</div>}
  </div>;
}
