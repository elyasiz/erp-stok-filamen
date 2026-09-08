"use client";

import { AlertCircle, CheckCircle2, LoaderCircle, RefreshCw, Scale } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { formatDate, formatNumber } from "./report-state";

type WeighingTask = {
  id: string;
  number: string;
  userName: string;
  activityName: string;
  completedAt: string;
  completedByName: string | null;
  items: Array<{
    inventoryItemId: string;
    code: string;
    product: string;
    color: string;
    startingGrams: number;
    provisionalUsedGrams: number;
    reservedRemainingGrams: number;
  }>;
};

const key = (taskId: string, itemId: string) => `${taskId}:${itemId}`;
const validAmount = (value: string | undefined, maximum: number) => {
  if (!value?.trim()) return false;
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 && amount <= maximum && Math.abs(amount * 100 - Math.round(amount * 100)) < 0.000001;
};

export default function UsageWeighingsView() {
  const [tasks, setTasks] = useState<WeighingTask[]>([]);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/v1/usage-weighings", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message ?? "Daftar penimbangan belum dapat dimuat.");
      setTasks(body.weighings);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Daftar penimbangan belum dapat dimuat."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  const submit = async (task: WeighingTask) => {
    const note = notes[task.id]?.trim() ?? "";
    if (note.length < 3 || !task.items.every((item) => validAmount(amounts[key(task.id, item.inventoryItemId)], item.startingGrams))) return;
    setSaving(task.id); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/v1/usage-weighings/${encodeURIComponent(task.id)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note, items: task.items.map((item) => ({ inventoryItemId: item.inventoryItemId, remainingGrams: Number(amounts[key(task.id, item.inventoryItemId)]) })) }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message ?? "Hasil timbang belum dapat disimpan.");
      setNotice(`${task.number} sudah diverifikasi. Saldo stok dan gram penggunaan telah diperbarui.`);
      setAmounts((current) => Object.fromEntries(Object.entries(current).filter(([entry]) => !entry.startsWith(`${task.id}:`))));
      setNotes((current) => { const next = { ...current }; delete next[task.id]; return next; });
      await load();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Hasil timbang belum dapat disimpan."); }
    finally { setSaving(null); }
  };

  return <div className="accounts-view usage-weighings-view">
    <div className="module-heading"><div><span className="eyebrow">PENGAWASAN</span><h1>Verifikasi gram</h1><p>Timbang unit dari print gagal sebelum filamen digunakan kembali.</p></div><button className="button secondary" onClick={() => void load()} disabled={loading}><RefreshCw className={loading ? "spin" : ""} size={17} /> Muat ulang</button></div>
    <section className="module-stats"><article><span>Perlu ditimbang</span><strong>{loading ? "—" : tasks.length}</strong><small>Sesi gagal dengan gram sementara</small></article><article><span>Unit tertahan</span><strong>{loading ? "—" : tasks.reduce((sum, task) => sum + task.items.length, 0)}</strong><small>Tidak dapat dipakai sebelum verifikasi</small></article></section>
    {notice ? <div className="info-strip" role="status"><CheckCircle2 size={17} />{notice}</div> : null}
    {error ? <div className="inventory-form-error" role="alert"><AlertCircle size={17} />{error}</div> : null}
    {loading ? <div className="report-empty"><LoaderCircle className="spin" size={24} /> Memuat tugas penimbangan...</div> : tasks.length ? <div className="weighing-list">{tasks.map((task) => {
      const valid = task.items.every((item) => validAmount(amounts[key(task.id, item.inventoryItemId)], item.startingGrams));
      const noteValid = (notes[task.id]?.trim().length ?? 0) >= 3;
      return <article className="weighing-card" key={task.id}>
        <div className="correction-card-head"><div><span className="status warning"><i />Perlu ditimbang</span><h2>{task.number}</h2><p>{task.userName} · selesai {formatDate(task.completedAt)}{task.completedByName ? ` · dicatat ${task.completedByName}` : ""}</p></div><Scale size={25} /></div>
        <p className="weighing-instruction">Timbang spool, kurangi bobot spool kosong bila perlu, lalu masukkan <strong>sisa filamen bersih</strong>.</p>
        <div className="table-wrap" tabIndex={0} role="region" aria-label={`Verifikasi gram ${task.number}`}><table className="data-table"><thead><tr><th>Filamen</th><th>Saldo awal</th><th>Cadangan</th><th>Saldo sementara</th><th>Sisa hasil timbang</th><th>Pemakaian aktual</th><th>Penyesuaian stok</th></tr></thead><tbody>{task.items.map((item) => {
          const fieldKey = key(task.id, item.inventoryItemId);
          const value = amounts[fieldKey] ?? "";
          const amountValid = validAmount(value, item.startingGrams);
          const measured = amountValid ? Number(value) : null;
          return <tr key={item.inventoryItemId}><td><strong>{item.product} · {item.color}</strong><small>{item.code}</small></td><td>{formatNumber(item.startingGrams)} g</td><td>{formatNumber(item.provisionalUsedGrams)} g</td><td>{formatNumber(item.reservedRemainingGrams)} g</td><td><input aria-label={`Sisa hasil timbang ${item.code}`} type="number" min="0" max={item.startingGrams} step="0.01" placeholder="Isi sisa gram" value={value} disabled={saving === task.id} onChange={(event) => setAmounts((current) => ({ ...current, [fieldKey]: event.target.value }))} /></td><td>{measured === null ? "—" : `${formatNumber(item.startingGrams - measured)} g`}</td><td className={measured !== null && measured - item.reservedRemainingGrams >= 0 ? "positive-copy" : "negative-copy"}>{measured === null ? "—" : `${measured - item.reservedRemainingGrams > 0 ? "+" : ""}${formatNumber(measured - item.reservedRemainingGrams)} g`}</td></tr>;
        })}</tbody></table></div>
        <label className="stack-field"><span>Catatan penimbangan *</span><textarea minLength={3} maxLength={500} value={notes[task.id] ?? ""} disabled={saving === task.id} onChange={(event) => setNotes((current) => ({ ...current, [task.id]: event.target.value }))} placeholder="Contoh: ditimbang ulang setelah print gagal" /></label>
        <div className="summary-note weighing"><Scale size={18} /><span>Setelah disimpan, gram sementara diganti dengan hasil timbang dan unit otomatis tersedia kembali sesuai jumlah stoknya.</span></div>
        <div className="dialog-actions"><button className="button primary" disabled={Boolean(saving) || !valid || !noteValid} onClick={() => void submit(task)}>{saving === task.id ? <LoaderCircle className="spin" size={17} /> : <CheckCircle2 size={17} />} Simpan hasil timbang</button></div>
      </article>;
    })}</div> : <div className="report-empty"><CheckCircle2 size={24} /> Tidak ada unit yang perlu ditimbang.</div>}
  </div>;
}
