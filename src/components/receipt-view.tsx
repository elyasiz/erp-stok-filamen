"use client";

import {
  AlertCircle,
  ArrowLeft,
  Camera,
  Check,
  CheckCircle2,
  CircleDollarSign,
  Eye,
  FileText,
  History,
  LoaderCircle,
  PackageCheck,
  Pencil,
  Plus,
  ReceiptText,
  Save,
  ScanBarcode,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { DecodeHintType as ZXingDecodeHintType } from "@zxing/library";

type ReceiptStatus = "DRAFT" | "FINALIZED";
type PackagingType = "WITH_SPOOL" | "REFILL";

type ReceiptItem = {
  id: string;
  barcode: string;
  product: string;
  material: string;
  color: string;
  packagingType: PackagingType;
  quantity: number;
  unitWeightGrams: number;
  unitCost: number;
  lineNumber: number;
};

type ReceiptSummary = {
  id: string;
  receiptNumber: string;
  supplier: string;
  invoiceNumber: string;
  purchaseDate: string;
  receivedDate: string;
  status: ReceiptStatus;
  discount: number;
  tax: number;
  shipping: number;
  subtotal: number;
  total: number;
  notes: string;
  itemLines: number;
  unitCount: number;
  createdAt: string;
  updatedAt: string;
};

type ReceiptDetail = ReceiptSummary & { items: ReceiptItem[] };

type ReceiptItemForm = Omit<ReceiptItem, "id" | "lineNumber"> & { clientId: string };

type ReceiptFormData = {
  supplier: string;
  invoiceNumber: string;
  purchaseDate: string;
  receivedDate: string;
  discount: number;
  tax: number;
  shipping: number;
  notes: string;
  items: ReceiptItemForm[];
};

const suppliers = [
  { name: "IndoCart", location: "Jabodetabek" },
  { name: "3D Zaiku", location: "Jakarta Barat" },
  { name: "TekLab / PT Tek Lab Indonesia", location: "Indonesia" },
  { name: "IndoMakers Indonesia", location: "Jakarta Barat" },
  { name: "IMA 3D Printer", location: "Tangerang" },
];

const rupiah = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });

function todayInJakarta() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function emptyLine(clientId = "line-1"): ReceiptItemForm {
  return { clientId, barcode: "", product: "", material: "PLA", color: "", packagingType: "WITH_SPOOL", quantity: 1, unitWeightGrams: 1000, unitCost: 0 };
}

function emptyForm(): ReceiptFormData {
  const today = todayInJakarta();
  return { supplier: "IndoCart", invoiceNumber: "", purchaseDate: today, receivedDate: today, discount: 0, tax: 0, shipping: 0, notes: "", items: [emptyLine()] };
}

function receiptToForm(receipt: ReceiptDetail): ReceiptFormData {
  return {
    supplier: receipt.supplier,
    invoiceNumber: receipt.invoiceNumber,
    purchaseDate: receipt.purchaseDate,
    receivedDate: receipt.receivedDate,
    discount: receipt.discount,
    tax: receipt.tax,
    shipping: receipt.shipping,
    notes: receipt.notes,
    items: receipt.items.map((item) => ({
      clientId: item.id,
      barcode: item.barcode,
      product: item.product,
      material: item.material,
      color: item.color,
      packagingType: item.packagingType,
      quantity: item.quantity,
      unitWeightGrams: item.unitWeightGrams,
      unitCost: item.unitCost,
    })),
  };
}

function formatDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

function Toast({ text, onClose }: { text: string; onClose: () => void }) {
  return <div className="app-toast" role="status"><CheckCircle2 size={18} /><span>{text}</span><button onClick={onClose} aria-label="Tutup pemberitahuan"><X size={16} /></button></div>;
}

function ReceiptDialog({ children, eyebrow, title, onClose, wide = false }: { children: React.ReactNode; eyebrow: string; title: string; onClose: () => void; wide?: boolean }) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div className="dialog-layer" role="presentation" onMouseDown={(event) => event.currentTarget === event.target && onClose()}>
      <section className={`inventory-dialog receipt-dialog${wide ? " wide" : ""}`} role="dialog" aria-modal="true" aria-labelledby="receipt-dialog-title">
        <div className="dialog-head"><div><span className="eyebrow">{eyebrow}</span><h2 id="receipt-dialog-title">{title}</h2></div><button className="icon-button" onClick={onClose} aria-label="Tutup dialog"><X size={18} /></button></div>
        {children}
      </section>
    </div>
  );
}

export function CameraBarcodeScanner({ onDetected, onClose, contextLabel = "PEMINDAI BARCODE" }: { onDetected: (value: string) => void; onClose: () => void; contextLabel?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const detectedRef = useRef(onDetected);
  const [cameraState, setCameraState] = useState<"starting" | "active" | "manual" | "error">("starting");
  const [message, setMessage] = useState("Meminta izin kamera...");
  const [manualCode, setManualCode] = useState("");

  useEffect(() => { detectedRef.current = onDetected; }, [onDetected]);

  useEffect(() => {
    let stopped = false;
    let scannerControls: { stop: () => void } | null = null;

    const stop = () => {
      stopped = true;
      scannerControls?.stop();
    };

    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraState("error");
        setMessage("Browser ini tidak menyediakan akses kamera. Masukkan barcode secara manual.");
        return;
      }
      try {
        const video = videoRef.current;
        if (!video) return;
        const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([import("@zxing/browser"), import("@zxing/library")]);
        const formats = [BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E, BarcodeFormat.QR_CODE];
        const hints = new Map<ZXingDecodeHintType, unknown>([[DecodeHintType.POSSIBLE_FORMATS, formats], [DecodeHintType.TRY_HARDER, true]]);
        const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 80, delayBetweenScanSuccess: 500 });
        if (stopped) return;
        setCameraState("active");
        setMessage("Arahkan barcode Code 128 pada label Stok Filamen ke dalam kotak. Jaga label tetap datar dan cukup terang.");
        scannerControls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false },
          video,
          (result, _error, controls) => {
            const value = result?.getText().trim();
            if (value && !stopped) {
              stopped = true;
              controls.stop();
              detectedRef.current(value);
            }
          }
        );
        if (stopped) scannerControls.stop();
      } catch (error) {
        const name = error instanceof DOMException ? error.name : "";
        setCameraState("error");
        setMessage(name === "NotAllowedError" ? "Izin kamera ditolak. Izinkan kamera pada browser atau masukkan barcode manual." : name === "NotFoundError" ? "Kamera tidak ditemukan pada perangkat ini." : "Pemindai belum dapat dibuka. Coba lagi atau masukkan barcode manual.");
      }
    };

    void start();
    return stop;
  }, []);

  const applyManualCode = () => {
    const value = manualCode.trim();
    if (value) onDetected(value);
  };

  return (
    <div className="dialog-layer" role="presentation">
      <section className="camera-dialog" role="dialog" aria-modal="true" aria-labelledby="camera-title">
        <div className="dialog-head"><div><span className="eyebrow">{contextLabel}</span><h2 id="camera-title">Scan barcode dengan kamera</h2></div><button className="icon-button" onClick={onClose} aria-label="Tutup kamera"><X size={18} /></button></div>
        <div className={`camera-viewport ${cameraState}`}>
          <video ref={videoRef} muted playsInline aria-label="Pratinjau kamera" />
          <div className="camera-frame"><i /><i /><i /><i /><span /></div>
          <span className="camera-format-badge">CODE 128 · LABEL STOK</span>
          {cameraState === "starting" ? <LoaderCircle className="camera-loader spin" size={30} /> : null}
          {cameraState === "error" ? <div className="camera-error"><Camera size={34} /><strong>Kamera tidak aktif</strong></div> : null}
        </div>
        <p className="camera-message" aria-live="polite">{message}</p>
        <div className="camera-manual"><label><span>Barcode manual</span><input autoComplete="off" value={manualCode} onChange={(event) => setManualCode(event.target.value)} onKeyDown={(event) => event.key === "Enter" && applyManualCode()} placeholder="Contoh: 6975337031170" /></label><button className="button secondary" onClick={applyManualCode} disabled={!manualCode.trim()}><Check size={16} /> Gunakan kode</button></div>
      </section>
    </div>
  );
}

async function fetchReceipts(): Promise<ReceiptSummary[]> {
  const response = await fetch("/api/v1/receipts", { cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message ?? "Riwayat penerimaan gagal dimuat.");
  return data.receipts ?? [];
}

async function fetchReceipt(id: string): Promise<ReceiptDetail> {
  const response = await fetch(`/api/v1/receipts/${id}`, { cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message ?? "Detail penerimaan gagal dimuat.");
  return data.receipt;
}

export default function ReceiptView() {
  const [receipts, setReceipts] = useState<ReceiptSummary[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [editorMode, setEditorMode] = useState<"create" | "edit" | null>(null);
  const [form, setForm] = useState<ReceiptFormData>(emptyForm);
  const [selected, setSelected] = useState<ReceiptDetail | null>(null);
  const [dialogMode, setDialogMode] = useState<"view" | "delete" | null>(null);
  const [scannerLine, setScannerLine] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [openingId, setOpeningId] = useState("");
  const [formError, setFormError] = useState("");
  const [toast, setToast] = useState("");

  const loadReceipts = async () => {
    setLoading(true);
    setLoadError("");
    try {
      setReceipts(await fetchReceipts());
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Riwayat penerimaan gagal dimuat.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    fetchReceipts()
      .then((next) => { if (active) setReceipts(next); })
      .catch((error: unknown) => { if (active) setLoadError(error instanceof Error ? error.message : "Riwayat penerimaan gagal dimuat."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const filtered = useMemo(() => receipts.filter((receipt) => `${receipt.receiptNumber} ${receipt.invoiceNumber} ${receipt.supplier}`.toLowerCase().includes(query.toLowerCase())), [query, receipts]);
  const finalizedCount = receipts.filter((receipt) => receipt.status === "FINALIZED").length;
  const draftCount = receipts.filter((receipt) => receipt.status === "DRAFT").length;
  const receivedUnits = receipts.filter((receipt) => receipt.status === "FINALIZED").reduce((sum, receipt) => sum + receipt.unitCount, 0);
  const subtotal = form.items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0);
  const total = subtotal - form.discount + form.tax + form.shipping;
  const totalUnits = form.items.reduce((sum, item) => sum + item.quantity, 0);

  const closeEditor = () => { setEditorMode(null); setSelected(null); setFormError(""); };
  const openCreate = () => { setForm(emptyForm()); setSelected(null); setFormError(""); setEditorMode("create"); };

  const openRecord = async (summary: ReceiptSummary, mode: "view" | "edit" | "delete") => {
    setOpeningId(summary.id);
    setFormError("");
    try {
      const detail = await fetchReceipt(summary.id);
      setSelected(detail);
      if (mode === "edit") {
        setForm(receiptToForm(detail));
        setEditorMode("edit");
      } else {
        setDialogMode(mode);
      }
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Penerimaan gagal dibuka.");
    } finally {
      setOpeningId("");
    }
  };

  const updateLine = (index: number, patch: Partial<ReceiptItemForm>) => setForm((current) => ({ ...current, items: current.items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item) }));
  const addLine = () => setForm((current) => ({ ...current, items: [...current.items, emptyLine(`line-${Date.now()}`)] }));
  const removeLine = (index: number) => setForm((current) => ({ ...current, items: current.items.length === 1 ? [emptyLine(current.items[0].clientId)] : current.items.filter((_, itemIndex) => itemIndex !== index) }));

  const saveReceipt = async (requestedStatus: ReceiptStatus) => {
    setSaving(true);
    setFormError("");
    try {
      const status: ReceiptStatus = selected?.status === "FINALIZED" ? "FINALIZED" : requestedStatus;
      const response = await fetch(editorMode === "edit" && selected ? `/api/v1/receipts/${selected.id}` : "/api/v1/receipts", {
        method: editorMode === "edit" ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, status, items: form.items.map((item) => ({ barcode: item.barcode, product: item.product, material: item.material, color: item.color, packagingType: item.packagingType, quantity: item.quantity, unitWeightGrams: item.unitWeightGrams, unitCost: item.unitCost })) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Penerimaan gagal disimpan.");
      const saved = data.receipt as ReceiptDetail;
      closeEditor();
      setToast(status === "FINALIZED" ? `${saved.receiptNumber} berhasil difinalisasi. ${saved.unitCount} unit masuk ke stok filamen.` : `${saved.receiptNumber} berhasil disimpan sebagai draft.`);
      await loadReceipts();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Penerimaan gagal disimpan.");
    } finally {
      setSaving(false);
    }
  };

  const deleteSelected = async () => {
    if (!selected) return;
    setSaving(true);
    setFormError("");
    try {
      const response = await fetch(`/api/v1/receipts/${selected.id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Penerimaan gagal dihapus.");
      const number = selected.receiptNumber;
      setSelected(null);
      setDialogMode(null);
      setToast(`${number} berhasil dihapus.`);
      await loadReceipts();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Penerimaan gagal dihapus.");
    } finally {
      setSaving(false);
    }
  };

  const handleDetected = (value: string) => {
    if (scannerLine !== null) updateLine(scannerLine, { barcode: value });
    setScannerLine(null);
    setToast(`Barcode ${value} berhasil dipindai.`);
  };

  return (
    <>
      <div className="module-heading">
        <div><span className="eyebrow">INVENTORY · BARANG MASUK</span><h1>{editorMode ? (editorMode === "create" ? "Penerimaan baru" : `Ubah ${selected?.receiptNumber ?? "penerimaan"}`) : "Barang masuk"}</h1><p>{editorMode ? "Catat invoice dan produk yang benar-benar diterima." : "Kelola penerimaan supplier dan sinkronkan unit ke stok filamen."}</p></div>
        <div className="heading-actions">{editorMode ? <button className="button secondary" onClick={closeEditor} disabled={saving}><ArrowLeft size={17} /> Kembali ke riwayat</button> : <><button className="button secondary" onClick={() => void loadReceipts()} disabled={loading}><LoaderCircle className={loading ? "spin" : ""} size={17} /> Muat ulang</button><button className="button primary" onClick={openCreate}><Plus size={17} /> Catat penerimaan</button></>}</div>
      </div>

      {!editorMode ? <>
        <section className="module-stats compact-stats receipt-stats">
          <article><span>Total penerimaan</span><strong>{receipts.length}</strong><small>seluruh dokumen</small></article>
          <article><span>Final</span><strong>{finalizedCount}</strong><small>sudah masuk stok</small></article>
          <article><span>Draft</span><strong>{draftCount}</strong><small>masih dapat dilengkapi</small></article>
          <article><span>Unit diterima</span><strong>{receivedUnits}</strong><small>dari penerimaan final</small></article>
        </section>
        <section className="data-panel">
          <div className="toolbar"><label className="table-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari nomor penerimaan, invoice, atau supplier..." /></label><div className="receipt-toolbar-label"><History size={15} /> Riwayat database</div></div>
          {loadError ? <div className="inventory-load-error"><AlertCircle size={21} /><div><strong>Riwayat belum dapat dimuat</strong><span>{loadError}</span></div><button className="button secondary" onClick={() => void loadReceipts()}>Coba lagi</button></div> : null}
          {!loadError ? <div className="table-wrap" tabIndex={0} role="region" aria-label="Tabel barang masuk"><table className="data-table receipt-table"><thead><tr><th>Penerimaan</th><th>Supplier</th><th>Tanggal diterima</th><th>Produk / Unit</th><th>Total biaya</th><th>Status</th><th>Aksi</th></tr></thead><tbody>
            {loading ? <tr><td colSpan={7}><div className="inventory-empty"><LoaderCircle className="spin" size={28} /><strong>Memuat penerimaan...</strong></div></td></tr> : null}
            {!loading && !filtered.length ? <tr><td colSpan={7}><div className="inventory-empty"><span><ReceiptText size={30} /></span><strong>{receipts.length ? "Tidak ada hasil yang cocok" : "Belum ada penerimaan barang"}</strong><p>{receipts.length ? "Ubah kata pencarian Anda." : "Catat invoice supplier pertama untuk mulai menerima filamen."}</p>{!receipts.length ? <button className="button primary" onClick={openCreate}><Plus size={16} /> Catat penerimaan pertama</button> : null}</div></td></tr> : null}
            {!loading && filtered.map((receipt) => <tr key={receipt.id}><td><div className="receipt-number-cell"><span><FileText size={17} /></span><div><strong>{receipt.receiptNumber}</strong><small>{receipt.invoiceNumber}</small></div></div></td><td>{receipt.supplier}</td><td>{formatDate(receipt.receivedDate)}</td><td><strong className="cell-main">{receipt.itemLines} produk</strong><small className="cell-sub">{receipt.unitCount} unit</small></td><td>{rupiah.format(receipt.total)}</td><td><span className={`receipt-status ${receipt.status.toLowerCase()}`}><i />{receipt.status === "FINALIZED" ? "Final" : "Draft"}</span></td><td><div className="row-actions"><button className="table-action" onClick={() => void openRecord(receipt, "view")} disabled={openingId === receipt.id} aria-label={`Lihat ${receipt.receiptNumber}`} title="Lihat">{openingId === receipt.id ? <LoaderCircle className="spin" size={15} /> : <Eye size={15} />}</button><button className="table-action" onClick={() => void openRecord(receipt, "edit")} disabled={Boolean(openingId)} aria-label={`Ubah ${receipt.receiptNumber}`} title="Ubah"><Pencil size={15} /></button><button className="table-action danger" onClick={() => void openRecord(receipt, "delete")} disabled={Boolean(openingId)} aria-label={`Hapus ${receipt.receiptNumber}`} title="Hapus"><Trash2 size={15} /></button></div></td></tr>)}
          </tbody></table></div> : null}
          {!loadError ? <div className="table-footer"><span>Menampilkan {filtered.length} dari {receipts.length} penerimaan</span><span>Data tersimpan di database</span></div> : null}
        </section>
      </> : null}

      {editorMode ? <div className="receipt-editor-grid">
        <section className="form-panel receipt-editor-main">
          <div className="section-title"><div><h2>Informasi supplier & invoice</h2><p>Supplier dipilih dari daftar resmi TIDIGO.</p></div><ReceiptText size={20} /></div>
          <div className="form-grid receipt-meta-grid">
            <label><span>Supplier *</span><select value={form.supplier} onChange={(event) => setForm({ ...form, supplier: event.target.value })}>{suppliers.map((supplier) => <option value={supplier.name} key={supplier.name}>{supplier.name} — {supplier.location}</option>)}</select></label>
            <label><span>Nomor invoice *</span><input required maxLength={80} value={form.invoiceNumber} onChange={(event) => setForm({ ...form, invoiceNumber: event.target.value })} placeholder="Contoh: INV-2026-001" /></label>
            <label><span>Tanggal pembelian *</span><input type="date" value={form.purchaseDate} onChange={(event) => setForm({ ...form, purchaseDate: event.target.value })} /></label>
            <label><span>Tanggal diterima *</span><input type="date" value={form.receivedDate} onChange={(event) => setForm({ ...form, receivedDate: event.target.value })} /></label>
          </div>
          <div className="section-divider" />
          <div className="section-title"><div><h2>Produk yang diterima</h2><p>Scan barcode dengan kamera atau masukkan kode secara manual.</p></div><span className="count-badge">{form.items.length}</span></div>
          <div className="receipt-lines">{form.items.map((item, index) => <article className="receipt-line" key={item.clientId}>
            <div className="receipt-line-head"><span className="item-index">{String(index + 1).padStart(2, "0")}</span><div><strong>Produk {index + 1}</strong><small>{item.product || "Lengkapi data filamen"}</small></div><button className="mini-button" type="button" onClick={() => setScannerLine(index)}><Camera size={15} /> Scan kamera</button><button className="table-action danger" type="button" onClick={() => removeLine(index)} aria-label={`Hapus produk ${index + 1}`}><Trash2 size={15} /></button></div>
            <div className="receipt-line-grid">
              <label className="barcode-field"><span>Barcode produk *</span><div><ScanBarcode size={16} /><input value={item.barcode} onChange={(event) => updateLine(index, { barcode: event.target.value })} placeholder="Scan atau masukkan barcode" /></div></label>
              <label><span>Nama produk *</span><input value={item.product} onChange={(event) => updateLine(index, { product: event.target.value })} placeholder="Contoh: PLA Basic" /></label>
              <label><span>Material *</span><input value={item.material} onChange={(event) => updateLine(index, { material: event.target.value.toUpperCase() })} placeholder="PLA" /></label>
              <label><span>Warna *</span><input value={item.color} onChange={(event) => updateLine(index, { color: event.target.value })} placeholder="Matte Black" /></label>
              <label><span>Kemasan *</span><select value={item.packagingType} onChange={(event) => updateLine(index, { packagingType: event.target.value as PackagingType })}><option value="WITH_SPOOL">With Spool</option><option value="REFILL">Refill</option></select></label>
              <label><span>Jumlah *</span><input type="number" min="1" max="50" value={item.quantity} onChange={(event) => updateLine(index, { quantity: Number(event.target.value) })} /></label>
              <label><span>Berat / unit (gram) *</span><input type="number" min="1" max="100000" step="0.01" value={item.unitWeightGrams} onChange={(event) => updateLine(index, { unitWeightGrams: Number(event.target.value) })} /></label>
              <label><span>Harga / unit *</span><input type="number" min="0" step="1" value={item.unitCost} onChange={(event) => updateLine(index, { unitCost: Number(event.target.value) })} /></label>
            </div>
            <div className="receipt-line-total"><span>Subtotal produk</span><strong>{rupiah.format(item.quantity * item.unitCost)}</strong></div>
          </article>)}</div>
          <button className="add-row" type="button" onClick={addLine} disabled={form.items.length >= 20}><Plus size={16} /> Tambah produk lain</button>
          <div className="section-divider" />
          <label className="receipt-notes"><span>Catatan penerimaan</span><textarea rows={3} maxLength={500} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Kondisi kemasan, nomor surat jalan, atau catatan lain..." /></label>
        </section>

        <aside className="summary-panel receipt-cost-panel">
          <div className="section-title"><div><h2>Ringkasan biaya</h2><p>Biaya akan dialokasikan ke setiap unit.</p></div><CircleDollarSign size={20} /></div>
          <dl className="cost-list"><div><dt>Subtotal barang</dt><dd>{rupiah.format(subtotal)}</dd></div></dl>
          <div className="receipt-cost-inputs"><label><span>Diskon</span><input type="number" min="0" step="1" value={form.discount} onChange={(event) => setForm({ ...form, discount: Number(event.target.value) })} /></label><label><span>Pajak</span><input type="number" min="0" step="1" value={form.tax} onChange={(event) => setForm({ ...form, tax: Number(event.target.value) })} /></label><label><span>Ongkir</span><input type="number" min="0" step="1" value={form.shipping} onChange={(event) => setForm({ ...form, shipping: Number(event.target.value) })} /></label></div>
          <dl className="cost-list receipt-total"><div className="total"><dt>Total landed cost</dt><dd>{rupiah.format(total)}</dd></div></dl>
          <div className="unit-cost"><span>Rata-rata per unit</span><strong>{rupiah.format(totalUnits ? total / totalUnits : 0)}</strong><small>{totalUnits} unit dari {form.items.length} produk</small></div>
          <div className="summary-note"><PackageCheck size={18} /><span>{selected?.status === "FINALIZED" ? <><strong>Stok akan disinkronkan ulang.</strong> Perubahan hanya diizinkan selama unit belum digunakan.</> : <><strong>{totalUnits} unit baru</strong> akan dibuat di Stok Filamen saat difinalisasi.</>}</span></div>
          {formError ? <div className="inventory-form-error" role="alert"><AlertCircle size={16} />{formError}</div> : null}
          {selected?.status !== "FINALIZED" ? <button className="button secondary full" onClick={() => void saveReceipt("DRAFT")} disabled={saving}>{saving ? <LoaderCircle className="spin" size={16} /> : <Save size={16} />} Simpan draft</button> : null}
          <button className="button primary full" onClick={() => void saveReceipt("FINALIZED")} disabled={saving}>{saving ? <><LoaderCircle className="spin" size={16} /> Menyimpan...</> : selected?.status === "FINALIZED" ? <><Check size={16} /> Simpan & sinkronkan stok</> : <><CheckCircle2 size={16} /> Simpan & finalisasi</>}</button>
        </aside>
      </div> : null}

      {dialogMode === "view" && selected ? <ReceiptDialog eyebrow="DETAIL PENERIMAAN" title={selected.receiptNumber} onClose={() => { setDialogMode(null); setSelected(null); }} wide><div className="receipt-detail-summary"><div><span>Supplier</span><strong>{selected.supplier}</strong></div><div><span>Invoice</span><strong>{selected.invoiceNumber}</strong></div><div><span>Diterima</span><strong>{formatDate(selected.receivedDate)}</strong></div><div><span>Status</span><strong>{selected.status === "FINALIZED" ? "Final · masuk stok" : "Draft"}</strong></div></div><div className="receipt-detail-items">{selected.items.map((item) => <article key={item.id}><span className="product-token"><ScanBarcode size={17} /></span><div><strong>{item.product}</strong><small>{item.barcode} · {item.material} · {item.color} · {item.packagingType === "WITH_SPOOL" ? "With Spool" : "Refill"}</small></div><span>{item.quantity} × {item.unitWeightGrams.toLocaleString("id-ID")} g</span><strong>{rupiah.format(item.quantity * item.unitCost)}</strong></article>)}</div><dl className="receipt-detail-cost"><div><dt>Subtotal</dt><dd>{rupiah.format(selected.subtotal)}</dd></div><div><dt>Diskon</dt><dd>− {rupiah.format(selected.discount)}</dd></div><div><dt>Pajak + ongkir</dt><dd>{rupiah.format(selected.tax + selected.shipping)}</dd></div><div><dt>Total</dt><dd>{rupiah.format(selected.total)}</dd></div></dl>{selected.notes ? <div className="receipt-detail-note"><strong>Catatan</strong><p>{selected.notes}</p></div> : null}<div className="dialog-actions"><button className="button secondary danger-button" onClick={() => setDialogMode("delete")}><Trash2 size={16} /> Hapus</button><button className="button primary" onClick={() => { setForm(receiptToForm(selected)); setDialogMode(null); setEditorMode("edit"); }}><Pencil size={16} /> Ubah data</button></div></ReceiptDialog> : null}

      {dialogMode === "delete" && selected ? <ReceiptDialog eyebrow="KONFIRMASI" title={`Hapus ${selected.receiptNumber}?`} onClose={() => { setDialogMode(null); setSelected(null); setFormError(""); }}><div className="delete-copy"><span><Trash2 size={22} /></span><div><strong>Penerimaan dan unit stok buatannya akan dihapus.</strong><p>Penghapusan akan ditolak bila salah satu unit sudah digunakan.</p></div></div>{formError ? <div className="inventory-form-error" role="alert"><AlertCircle size={16} />{formError}</div> : null}<div className="dialog-actions"><button className="button secondary" onClick={() => { setDialogMode(null); setSelected(null); }} disabled={saving}>Batal</button><button className="button danger-button solid" onClick={() => void deleteSelected()} disabled={saving}>{saving ? <><LoaderCircle className="spin" size={16} /> Menghapus...</> : <><Trash2 size={16} /> Hapus permanen</>}</button></div></ReceiptDialog> : null}

      {scannerLine !== null ? <CameraBarcodeScanner contextLabel="PEMINDAI PRODUK" onDetected={handleDetected} onClose={() => setScannerLine(null)} /> : null}
      {toast ? <Toast text={toast} onClose={() => setToast("")} /> : null}
    </>
  );
}
