"use client";

import { AlertCircle, Camera, CheckCircle2, Circle, ClipboardCheck, LoaderCircle, ScanBarcode, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CameraBarcodeScanner } from "./receipt-view";

type UsageResult = "SUCCESS" | "PARTIAL" | "FAILED" | "CANCELLED";
type UsageSummary = {
  id: string;
  number: string;
  userName: string;
  usageType: "CLASS" | "NON_CLASS";
  nonClassType: "TRIAL_PRINT" | "SAMPLE" | null;
};
type UsageItem = {
  inventoryItemId: string;
  code: string;
  product: string;
  material: string;
  color: string;
  currentStatus: string;
  currentGrams: number;
  startingGrams: number;
  usedGrams: number | null;
  returnedGrams: number | null;
};
type UsageDetail = UsageSummary & {
  status: "ACTIVE" | "COMPLETED" | "CANCELLED";
  startedAt: string;
  completedAt: string | null;
  totalUsedGrams: number;
  totalReturnedGrams: number;
  result: UsageResult | null;
  notes: string;
  items: UsageItem[];
};

const resultLabels: Record<UsageResult, string> = { SUCCESS: "Berhasil", PARTIAL: "Sebagian", FAILED: "Gagal", CANCELLED: "Dibatalkan" };
const grams = (value: number) => value.toLocaleString("id-ID", { maximumFractionDigits: 2 });
const typeLabel = (session: UsageSummary) => session.usageType === "CLASS" ? "Kelas" : session.nonClassType === "SAMPLE" ? "Nonkelas · Sample" : "Nonkelas · Trial Print";

async function getSessions(signal?: AbortSignal): Promise<UsageSummary[]> {
  const response = await fetch("/api/v1/usages", { cache: "no-store", signal });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message ?? "Daftar sesi belum dapat dimuat.");
  return data.sessions;
}

async function getSession(url: string, signal?: AbortSignal): Promise<UsageDetail> {
  const response = await fetch(url, { cache: "no-store", signal });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message ?? "Sesi belum dapat dimuat.");
  return data.session;
}

function validGrams(value: string | undefined, maximum: number) {
  if (!value?.trim()) return false;
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 && amount <= maximum && Math.abs(amount * 100 - Math.round(amount * 100)) < 0.000001;
}

export default function CompleteUsageView({ initialSessionId, onOpenActive }: { initialSessionId: string | null; onOpenActive: () => void }) {
  const [sessions, setSessions] = useState<UsageSummary[]>([]);
  const [session, setSession] = useState<UsageDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [code, setCode] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const scanBusy = useRef(false);
  const [verifiedCodes, setVerifiedCodes] = useState<Record<string, string>>({});
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [result, setResult] = useState<UsageResult>("SUCCESS");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      getSessions(controller.signal),
      initialSessionId ? getSession(`/api/v1/usages/${encodeURIComponent(initialSessionId)}`, controller.signal) : Promise.resolve(null),
    ]).then(([list, detail]) => {
      if (!controller.signal.aborted) { setSessions(list); setSession(detail); }
    }).catch((cause) => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Data belum dapat dimuat.");
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [initialSessionId]);

  const applySession = (detail: UsageDetail) => {
    setSession(detail);
    setVerifiedCodes({});
    setAmounts({});
    setResult("SUCCESS");
    setNotes("");
    setCode("");
    setNotice("");
    setError("");
  };

  const selectSession = async (id: string) => {
    if (!id) return;
    setLoading(true);
    setError("");
    try { applySession(await getSession(`/api/v1/usages/${encodeURIComponent(id)}`)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Sesi belum dapat dimuat."); }
    finally { setLoading(false); }
  };

  const scanCode = async (rawCode = code) => {
    const normalized = rawCode.trim().toUpperCase();
    if (!normalized || scanBusy.current || saving || loading) return;
    scanBusy.current = true;
    setScanning(true);
    setError("");
    setNotice("");
    try {
      const detail = session ?? await getSession(`/api/v1/usages?barcode=${encodeURIComponent(normalized)}`);
      if (detail.status !== "ACTIVE") throw new Error("Sesi ini sudah ditutup. Pilih sesi aktif lainnya.");
      const item = detail.items.find((unit) => unit.code.toUpperCase() === normalized);
      if (!item) throw new Error("Barcode bukan bagian dari sesi yang dipilih. Pilih sesi yang sesuai terlebih dahulu.");
      if (!session) applySession(detail);
      setVerifiedCodes((current) => ({ ...current, [item.inventoryItemId]: normalized }));
      setCode("");
      setNotice(`${item.code} terverifikasi. Isi gram yang digunakan pada unit ini.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Barcode belum dapat diperiksa."); }
    finally { scanBusy.current = false; setScanning(false); }
  };

  const startAnother = async () => {
    setSession(null);
    setVerifiedCodes({});
    setAmounts({});
    setCode("");
    setError("");
    setNotice("");
    setLoading(true);
    try { setSessions(await getSessions()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Daftar sesi belum dapat dimuat."); }
    finally { setLoading(false); }
  };

  const units = session?.items ?? [];
  const verifiedCount = units.filter((item) => verifiedCodes[item.inventoryItemId] === item.code.toUpperCase()).length;
  const allVerified = units.length > 0 && verifiedCount === units.length;
  const allAmountsValid = units.length > 0 && units.every((item) => validGrams(amounts[item.inventoryItemId], item.startingGrams));
  const stockChanged = session?.status === "ACTIVE" && units.some((item) => item.currentStatus !== "IN_USE" || item.currentGrams !== item.startingGrams);
  const totalUsed = units.reduce((sum, item) => sum + (validGrams(amounts[item.inventoryItemId], item.startingGrams) ? Number(amounts[item.inventoryItemId]) : 0), 0);
  const canFinalize = session?.status === "ACTIVE" && allVerified && allAmountsValid && !stockChanged && !saving && !loading && !scanning;

  const finalize = async () => {
    if (!session || !canFinalize) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/v1/usages/${encodeURIComponent(session.id)}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ result, notes, items: units.map((item) => ({
          inventoryItemId: item.inventoryItemId,
          barcode: verifiedCodes[item.inventoryItemId],
          usedGrams: Number(amounts[item.inventoryItemId]),
        })) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Penggunaan belum dapat diselesaikan.");
      setSession(data.session);
      setSessions((current) => current.filter((entry) => entry.id !== session.id));
      setNotice("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Penggunaan belum dapat diselesaikan. Periksa koneksi lalu muat ulang sesi."); }
    finally { setSaving(false); }
  };

  return <>
    <div className="module-heading"><div><span className="eyebrow">PENGGUNAAN · CHECK-IN</span><h1>Selesaikan penggunaan</h1><p>Data berasal dari Penggunaan Aktif. Verifikasi unit dan catat gram yang benar-benar terpakai.</p></div><div className="heading-actions"><button className="button secondary" onClick={onOpenActive} disabled={saving}>Penggunaan Aktif</button></div></div>
    {error ? <div className="inventory-form-error completion-alert" role="alert"><AlertCircle size={18} /><span>{error}</span><button className="mini-button" disabled={saving || loading} onClick={() => session ? void selectSession(session.id) : void startAnother()}>Muat ulang</button></div> : null}
    {session?.status === "COMPLETED" ? <section className="form-panel completion-success">
      <CheckCircle2 size={36} /><h2>Sesi sudah selesai</h2><p>{session.number} · {session.userName} · {typeLabel(session)}</p>
      <div className="info-strip">Data penyelesaian tersimpan. Sesi tidak lagi tampil di Penggunaan Aktif dan sisa stok sudah diperbarui.</div>
      <dl className="cost-list"><div><dt>Hasil pekerjaan</dt><dd>{session.result ? resultLabels[session.result] : "—"}</dd></div><div><dt>Total digunakan</dt><dd>{grams(session.totalUsedGrams)} g</dd></div><div><dt>Total tersisa</dt><dd>{grams(session.totalReturnedGrams)} g</dd></div><div><dt>Waktu selesai</dt><dd>{session.completedAt ? new Date(session.completedAt).toLocaleString("id-ID") : "—"}</dd></div></dl>
      <div className="completion-receipt">{units.map((item) => <article key={item.inventoryItemId}><div><strong>{item.product}</strong><small>{item.code}</small></div><span>Terpakai {grams(item.usedGrams ?? 0)} g</span><strong>Sisa {grams(item.returnedGrams ?? 0)} g</strong></article>)}</div>
      {session.notes ? <p className="completion-notes">Catatan: {session.notes}</p> : null}
      <div className="dialog-actions"><button className="button secondary" onClick={onOpenActive}>Lihat Penggunaan Aktif</button><button className="button primary" onClick={() => void startAnother()}>Selesaikan sesi lain</button></div>
    </section> : <>
      <section className="form-panel completion-picker">
        <label className="stack-field"><span>Pilih sesi penggunaan aktif</span><select value={session?.id ?? ""} disabled={loading || saving || scanning} onChange={(event) => void selectSession(event.target.value)}><option value="">{loading ? "Memuat sesi..." : "Pilih sesi atau scan barcode di bawah"}</option>{sessions.map((entry) => <option key={entry.id} value={entry.id}>{entry.number} · {entry.userName} · {typeLabel(entry)}</option>)}</select></label>
        <div className="completion-scan"><label className="stack-field"><span>{session ? "Scan ulang barcode unit sesi ini" : "Cari sesi dari barcode unit"}</span><input aria-label="Barcode unit untuk penyelesaian" value={code} disabled={saving || loading || scanning} onChange={(event) => setCode(event.target.value.toUpperCase())} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void scanCode(); } }} placeholder="Scan USB atau ketik barcode label" /></label><button className="button secondary" disabled={saving || loading || scanning || !code.trim()} onClick={() => void scanCode()}>{scanning ? <LoaderCircle className="spin" size={16} /> : <ScanBarcode size={16} />} {session ? "Verifikasi" : "Cari sesi"}</button><button className="button primary" disabled={saving || loading || scanning} onClick={() => setCameraOpen(true)}><Camera size={16} /> Kamera</button></div>
        {notice ? <div className="info-strip" role="status"><CheckCircle2 size={17} />{notice}</div> : null}
      </section>
      {loading ? <div className="inventory-empty"><LoaderCircle className="spin" size={28} /><strong>Memuat sesi penggunaan...</strong></div> : session ? <div className="complete-grid">
        <section className="form-panel">
          <div className="session-banner"><span><small>NOMOR SESI</small><strong>{session.number}</strong></span><span><small>PENGAMBIL</small><strong>{session.userName}</strong></span><span><small>JENIS</small><strong>{typeLabel(session)}</strong></span><span className="status success">Aktif</span></div>
          <div className="section-title"><div><h2>Unit dari sesi penggunaan</h2><p>Scan setiap unit, lalu isi gram pemakaian. Isi 0 jika tidak terpakai.</p></div><span className="verified">{verifiedCount}/{units.length} terverifikasi</span></div>
          {stockChanged ? <div className="inventory-form-error" role="alert"><AlertCircle size={16} /> Stok berubah sejak pengambilan. Periksa data stok sebelum finalisasi.</div> : null}
          <div className="return-list">{units.map((item) => {
            const verified = Boolean(verifiedCodes[item.inventoryItemId]);
            const value = amounts[item.inventoryItemId] ?? "";
            const valid = validGrams(value, item.startingGrams);
            return <div className="return-item completion-return-item" key={item.inventoryItemId}>
              {verified ? <CheckCircle2 className="check" size={20} aria-label="Barcode terverifikasi" /> : <Circle size={20} aria-label="Belum di-scan" />}
              <span><strong>{item.product}</strong><small>{item.code} · {item.color}</small><em>{verified ? "Barcode terverifikasi" : "Scan ulang barcode ini"}</em></span>
              <label><small>Saldo sebelum</small><strong>{grams(item.startingGrams)} g</strong></label>
              <label><small>Gram digunakan *</small><input aria-label={`Gram digunakan ${item.code}`} required type="number" min="0" max={item.startingGrams} step="0.01" placeholder="Isi gram" value={value} disabled={saving} aria-invalid={value !== "" && !valid} onChange={(event) => setAmounts((current) => ({ ...current, [item.inventoryItemId]: event.target.value }))} />{value !== "" && !valid ? <small className="warning-copy">Isi 0–{grams(item.startingGrams)} g (maks. 2 desimal)</small> : null}</label>
              <label><small>Sisa setelah</small><strong>{valid ? `${grams(item.startingGrams - Number(value))} g` : "—"}</strong></label>
            </div>;
          })}</div>
        </section>
        <aside className="summary-panel"><div className="section-title"><div><h2>Hasil pekerjaan</h2><p>Tersimpan bersama penutupan sesi.</p></div><ClipboardCheck size={20} /></div>
          <label className="stack-field"><span>Hasil</span><select value={result} disabled={saving} onChange={(event) => setResult(event.target.value as UsageResult)}>{Object.entries(resultLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <label className="stack-field"><span>Catatan (opsional)</span><textarea maxLength={1000} value={notes} disabled={saving} onChange={(event) => setNotes(event.target.value)} placeholder="Catatan hasil print..." /></label>
          <dl className="cost-list"><div><dt>Unit pada sesi</dt><dd>{units.length} unit</dd></div><div><dt>Total digunakan</dt><dd>{grams(totalUsed)} g</dd></div><div><dt>Total tersisa</dt><dd>{allAmountsValid ? `${grams(units.reduce((sum, item) => sum + item.startingGrams, 0) - totalUsed)} g` : "Lengkapi input gram"}</dd></div></dl>
          <div className="summary-note safe"><ShieldCheck size={18} /><span>Finalisasi menutup sesi dan memperbarui sisa stok. Barcode unit tetap sama; stok tidak dapat dikurangi dua kali untuk sesi yang sama.</span></div>
          {!allVerified || !allAmountsValid ? <p className="completion-hint">Scan seluruh unit dan lengkapi gram pemakaian untuk mengaktifkan tombol.</p> : null}
          <button className="button primary full" disabled={!canFinalize} onClick={() => void finalize()}>{saving ? <><LoaderCircle className="spin" size={17} /> Menyimpan...</> : <><ClipboardCheck size={17} /> Finalisasi penggunaan</>}</button>
        </aside>
      </div> : <section className="form-panel inventory-empty"><span><ScanBarcode size={28} /></span><strong>{sessions.length ? "Pilih sesi yang akan diselesaikan" : "Belum ada penggunaan aktif"}</strong><p>{sessions.length ? "Pilih nama/nomor sesi di atas atau scan label unit. Data pengambilan akan ditampilkan otomatis." : "Selesaikan hanya dapat dilakukan untuk sesi yang sudah dikonfirmasi dari Mulai Penggunaan."}</p></section>}
    </>}
    {cameraOpen ? <CameraBarcodeScanner contextLabel="VERIFIKASI PENGEMBALIAN" onDetected={(value) => { setCameraOpen(false); void scanCode(value); }} onClose={() => setCameraOpen(false)} /> : null}
  </>;
}
