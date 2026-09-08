"use client";

import { AlertCircle, CheckCircle2, History, LoaderCircle, Pencil } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "./auth-provider";
import { formatDate, formatNumber } from "./report-state";

export type CorrectionSession = {
  id: string;
  number: string;
  status: string;
  items: Array<{
    inventoryItemId: string;
    code: string;
    product: string | null;
    color: string | null;
    startingGrams: number;
    usedGrams: number | null;
  }>;
};

type Correction = {
  id: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  reason: string;
  requestedByName: string;
  reviewedByName: string | null;
  reviewNote: string;
  createdAt: string;
  reviewedAt: string | null;
  items: Array<{ inventoryItemId: string; code: string; beforeUsedGrams: number; afterUsedGrams: number; stockDeltaGrams: number }>;
};

const statusLabel = { PENDING: "Menunggu peninjauan", APPROVED: "Disetujui", REJECTED: "Ditolak" } as const;
const validAmount = (value: string, maximum: number) => {
  const amount = Number(value);
  return value.trim() !== "" && Number.isFinite(amount) && amount >= 0 && amount <= maximum && Math.abs(amount * 100 - Math.round(amount * 100)) < 0.000001;
};

export default function UsageCorrectionPanel({ session, onChanged }: { session: CorrectionSession; onChanged?: () => void }) {
  const { user } = useAuth();
  const [corrections, setCorrections] = useState<Correction[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reason, setReason] = useState("");
  const [amounts, setAmounts] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/v1/usages/${encodeURIComponent(session.id)}/corrections`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message ?? "Riwayat koreksi belum dapat dimuat.");
      setCorrections(body.corrections);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Riwayat koreksi belum dapat dimuat."); }
    finally { setLoading(false); }
  }, [session.id]);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  const pending = corrections.find((item) => item.status === "PENDING");
  const editableItems = session.items.filter((item) => item.usedGrams !== null);
  const allValid = editableItems.length > 0 && editableItems.every((item) => validAmount(amounts[item.inventoryItemId] ?? "", item.startingGrams));
  const changed = allValid && editableItems.some((item) => Number(amounts[item.inventoryItemId]) !== item.usedGrams);
  const stockDelta = allValid ? editableItems.reduce((total, item) => total + (item.usedGrams ?? 0) - Number(amounts[item.inventoryItemId]), 0) : 0;
  const openForm = () => {
    setAmounts(Object.fromEntries(editableItems.map((item) => [item.inventoryItemId, String(item.usedGrams ?? "")])))
    setReason(""); setError(""); setNotice(""); setEditing(true);
  };
  const submit = async () => {
    if (!allValid || !changed || reason.trim().length < 3) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/v1/usages/${encodeURIComponent(session.id)}/corrections`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason, items: editableItems.map((item) => ({ inventoryItemId: item.inventoryItemId, usedGrams: Number(amounts[item.inventoryItemId]) })) }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message ?? "Koreksi belum dapat disimpan.");
      setEditing(false);
      setNotice(body.correction.status === "APPROVED" ? "Koreksi diterapkan dan saldo stok sudah diperbarui." : "Permintaan dikirim kepada Admin/Owner untuk ditinjau.");
      await load();
      onChanged?.();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Koreksi belum dapat disimpan."); await load(); }
    finally { setSaving(false); }
  };

  if (session.status !== "COMPLETED") return null;
  return <section className="usage-correction-panel" aria-labelledby={`correction-${session.id}`}>
    <div className="section-title"><div><h3 id={`correction-${session.id}`}>Koreksi gram penggunaan</h3><p>Angka lama tetap tersimpan dalam riwayat audit.</p></div><History size={20} /></div>
    {loading ? <p className="correction-loading"><LoaderCircle className="spin" size={17} /> Memuat riwayat koreksi...</p> : null}
    {pending ? <div className="correction-pending"><strong>Menunggu peninjauan Admin/Owner</strong><span>Diajukan oleh {pending.requestedByName} · {formatDate(pending.createdAt)}</span><p>{pending.reason}</p>{pending.items.map((item) => <small key={item.inventoryItemId}>{item.code}: {formatNumber(item.beforeUsedGrams)} g → {formatNumber(item.afterUsedGrams)} g · stok {item.stockDeltaGrams > 0 ? "+" : ""}{formatNumber(item.stockDeltaGrams)} g</small>)}</div> : null}
    {!loading && !pending && !editing ? <button className="button secondary" type="button" onClick={openForm}><Pencil size={16} /> {user?.role === "COACH" ? "Ajukan koreksi" : "Koreksi gram"}</button> : null}
    {editing ? <div className="correction-form">
      <div className="table-wrap" tabIndex={0} role="region" aria-label="Form koreksi gram"><table className="data-table"><thead><tr><th>Unit</th><th>Gram sebelumnya</th><th>Gram sebenarnya</th><th>Dampak stok</th></tr></thead><tbody>{editableItems.map((item) => {
        const value = amounts[item.inventoryItemId] ?? "";
        const valid = validAmount(value, item.startingGrams);
        const delta = valid ? (item.usedGrams ?? 0) - Number(value) : null;
        return <tr key={item.inventoryItemId}><td><strong>{item.product ?? "Filamen"} · {item.color ?? "—"}</strong><small>{item.code}</small></td><td>{formatNumber(item.usedGrams ?? 0)} g</td><td><input aria-label={`Gram sebenarnya ${item.code}`} type="number" min="0" max={item.startingGrams} step="0.01" value={value} disabled={saving} onChange={(event) => setAmounts((current) => ({ ...current, [item.inventoryItemId]: event.target.value }))} /></td><td className={delta !== null && delta >= 0 ? "positive-copy" : "negative-copy"}>{delta === null ? "—" : `${delta > 0 ? "+" : ""}${formatNumber(delta)} g`}</td></tr>;
      })}</tbody></table></div>
      <label className="stack-field"><span>Alasan koreksi *</span><textarea required minLength={3} maxLength={500} value={reason} disabled={saving} onChange={(event) => setReason(event.target.value)} placeholder="Contoh: salah ketik setelah penimbangan" /></label>
      <div className="correction-preview"><CheckCircle2 size={18} /><span>{allValid ? `Dampak pada stok saat ini: ${stockDelta > 0 ? "+" : ""}${formatNumber(stockDelta)} gram.` : "Lengkapi gram sebenarnya untuk seluruh unit."}</span></div>
      <div className="dialog-actions"><button className="button secondary" type="button" disabled={saving} onClick={() => setEditing(false)}>Batal</button><button className="button primary" type="button" disabled={saving || !allValid || !changed || reason.trim().length < 3} onClick={() => void submit()}>{saving ? <LoaderCircle className="spin" size={17} /> : null}{user?.role === "COACH" ? "Kirim permintaan" : "Terapkan koreksi"}</button></div>
    </div> : null}
    {notice ? <div className="info-strip" role="status"><CheckCircle2 size={17} />{notice}</div> : null}
    {error ? <div className="inventory-form-error" role="alert"><AlertCircle size={17} />{error}</div> : null}
    {corrections.filter((item) => item.status !== "PENDING").length ? <details className="correction-history"><summary>Riwayat koreksi ({corrections.filter((item) => item.status !== "PENDING").length})</summary>{corrections.filter((item) => item.status !== "PENDING").map((item) => <article key={item.id}><span className={`status ${item.status === "APPROVED" ? "success" : "warning"}`}><i />{statusLabel[item.status]}</span><strong>{item.reason}</strong><small>{item.requestedByName} · {formatDate(item.createdAt)}{item.reviewedByName ? ` · Ditinjau ${item.reviewedByName}` : ""}</small>{item.reviewNote ? <p>Catatan: {item.reviewNote}</p> : null}</article>)}</details> : null}
  </section>;
}
