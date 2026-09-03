"use client";

import {
  AlertCircle,
  Barcode,
  Camera,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Download,
  Eye,
  FileSpreadsheet,
  Filter,
  History,
  LoaderCircle,
  PackageOpen,
  PackagePlus,
  Pencil,
  Plus,
  Printer,
  ScanBarcode,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  Users,
  Weight,
  X,
} from "lucide-react";
import JsBarcode from "jsbarcode";
import { useEffect, useMemo, useRef, useState } from "react";
import ReceiptView, { CameraBarcodeScanner } from "./receipt-view";
import CompleteUsageView from "./complete-usage-view";

export type ViewId =
  | "dashboard"
  | "inventory"
  | "receipt"
  | "usage-start"
  | "usage-active"
  | "usage-complete"
  | "reports"
  | "history"
  | "users"
  | "settings";

type NavigateView = (view: ViewId, sessionId?: string) => void;

const ledger = [
  { time: "01 Sep · 10:42", code: "FLM-2608-0128", type: "Penggunaan", ref: "USE-260901-008", change: "−184,50 g", before: "812,00 g", after: "627,50 g", user: "Operator Demo 4" },
  { time: "01 Sep · 09:56", code: "FLM-2609-0018", type: "Barang masuk", ref: "RCV-260901-003", change: "+1.000 g", before: "0 g", after: "1.000 g", user: "Admin Demo" },
  { time: "31 Agu · 16:38", code: "FLM-2608-0142", type: "Koreksi kurang", ref: "ADJ-260831-002", change: "−12,00 g", before: "160,00 g", after: "148,00 g", user: "Admin TIDIGO" },
  { time: "31 Agu · 15:14", code: "FLM-2608-0098", type: "Penggunaan", ref: "USE-260831-021", change: "−86,00 g", before: "322,00 g", after: "236,00 g", user: "Operator Demo 2" },
];

function Status({ children }: { children: string }) {
  const tone = children === "Tersedia" || children === "Aktif" ? "success" : children === "Digunakan" ? "info" : "warning";
  return <span className={`status ${tone}`}><i />{children}</span>;
}

function ModuleHeading({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children?: React.ReactNode }) {
  return (
    <div className="module-heading">
      <div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>
      {children ? <div className="heading-actions">{children}</div> : null}
    </div>
  );
}

function Toast({ text, onClose }: { text: string; onClose: () => void }) {
  return <div className="app-toast" role="status"><CheckCircle2 size={18} /><span>{text}</span><button onClick={onClose} aria-label="Tutup pemberitahuan"><X size={16} /></button></div>;
}

type InventoryStatusCode = "AVAILABLE" | "IN_USE" | "LOW_STOCK" | "EMPTY" | "DAMAGED" | "INACTIVE";
type PackagingCode = "WITH_SPOOL" | "REFILL";

type InventoryItem = {
  id: string;
  code: string;
  product: string;
  material: string;
  color: string;
  packagingType: PackagingCode;
  remainingGrams: number;
  status: InventoryStatusCode;
  unitCost: number;
  supplier: string;
  createdAt: string;
  updatedAt: string;
};

type InventoryFormData = Omit<InventoryItem, "id" | "createdAt" | "updatedAt">;

type UsageSessionSummary = {
  id: string;
  number: string;
  userName: string;
  usageType: "CLASS" | "NON_CLASS";
  nonClassType: "TRIAL_PRINT" | "SAMPLE" | null;
  status: "ACTIVE";
  startedAt: string;
  completedAt: string | null;
  unitCount: number;
  totalStartingGrams: number;
};

const inventoryStatusLabels: Record<InventoryStatusCode, string> = {
  AVAILABLE: "Tersedia",
  IN_USE: "Digunakan",
  LOW_STOCK: "Hampir Habis",
  EMPTY: "Habis",
  DAMAGED: "Rusak",
  INACTIVE: "Nonaktif",
};

const emptyInventoryForm: InventoryFormData = {
  code: "",
  product: "",
  material: "PLA",
  color: "",
  packagingType: "WITH_SPOOL",
  remainingGrams: 1000,
  status: "AVAILABLE",
  unitCost: 0,
  supplier: "",
};

const rupiah = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });

function InventoryDialog({ children, title, eyebrow, onClose }: { children: React.ReactNode; title: string; eyebrow: string; onClose: () => void }) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div className="dialog-layer" role="presentation" onMouseDown={(event) => event.currentTarget === event.target && onClose()}>
      <section className="inventory-dialog" role="dialog" aria-modal="true" aria-labelledby="inventory-dialog-title">
        <div className="dialog-head">
          <div><span className="eyebrow">{eyebrow}</span><h2 id="inventory-dialog-title">{title}</h2></div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Tutup dialog"><X size={18} /></button>
        </div>
        {children}
      </section>
    </div>
  );
}

function InventoryForm({ value, saving, error, onChange, onCancel, onSubmit }: {
  value: InventoryFormData;
  saving: boolean;
  error: string;
  onChange: (value: InventoryFormData) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return (
    <form onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
      <div className="form-grid inventory-form-grid">
        <label><span>Kode unit *</span><input autoFocus required maxLength={40} value={value.code} onChange={(event) => onChange({ ...value, code: event.target.value.toUpperCase() })} placeholder="FLM-2026-0001" /></label>
        <label><span>Nama produk *</span><input required maxLength={120} value={value.product} onChange={(event) => onChange({ ...value, product: event.target.value })} placeholder="Contoh: PLA Basic" /></label>
        <label><span>Material *</span><input required maxLength={30} value={value.material} onChange={(event) => onChange({ ...value, material: event.target.value.toUpperCase() })} placeholder="PLA" /></label>
        <label><span>Warna *</span><input required maxLength={60} value={value.color} onChange={(event) => onChange({ ...value, color: event.target.value })} placeholder="Matte Black" /></label>
        <label><span>Kemasan *</span><select value={value.packagingType} onChange={(event) => onChange({ ...value, packagingType: event.target.value as PackagingCode })}><option value="WITH_SPOOL">With Spool</option><option value="REFILL">Refill</option></select></label>
        <label><span>Sisa gram *</span><input required type="number" min="0" max="100000" step="0.01" value={value.remainingGrams} onChange={(event) => onChange({ ...value, remainingGrams: Number(event.target.value) })} /></label>
        <label><span>Status *</span><select value={value.status} onChange={(event) => onChange({ ...value, status: event.target.value as InventoryStatusCode })}>{Object.entries(inventoryStatusLabels).map(([status, label]) => <option value={status} key={status}>{label}</option>)}</select></label>
        <label><span>Harga unit *</span><input required type="number" min="0" step="1" value={value.unitCost} onChange={(event) => onChange({ ...value, unitCost: Number(event.target.value) })} /></label>
        <label className="full-field"><span>Supplier *</span><input required maxLength={120} value={value.supplier} onChange={(event) => onChange({ ...value, supplier: event.target.value })} placeholder="Nama supplier" /></label>
      </div>
      {error ? <div className="inventory-form-error" role="alert"><AlertCircle size={16} />{error}</div> : null}
      <div className="dialog-actions"><button className="button secondary" type="button" onClick={onCancel} disabled={saving}>Batal</button><button className="button primary" type="submit" disabled={saving}>{saving ? <><LoaderCircle className="spin" size={16} /> Menyimpan...</> : <><Check size={16} /> Simpan data</>}</button></div>
    </form>
  );
}

async function fetchInventoryItems(): Promise<InventoryItem[]> {
  const response = await fetch("/api/v1/inventory", { cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message ?? "Gagal memuat stok filamen.");
  return data.items ?? [];
}

async function fetchActiveUsageSessions(): Promise<UsageSessionSummary[]> {
  const response = await fetch("/api/v1/usages", { cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message ?? "Gagal memuat penggunaan aktif.");
  return data.sessions ?? [];
}

function BarcodeGraphic({ value }: { value: string }) {
  const barcodeRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!barcodeRef.current) return;
    JsBarcode(barcodeRef.current, value, {
      format: "CODE128",
      background: "#ffffff",
      lineColor: "#111111",
      width: 2,
      height: 72,
      margin: 0,
      displayValue: true,
      font: "monospace",
      fontSize: 17,
      fontOptions: "bold",
      textMargin: 5,
    });
  }, [value]);

  return <svg ref={barcodeRef} className="barcode-graphic" role="img" aria-label={`Barcode Code 128 ${value}`} />;
}

function PrintableBarcodeLabel({ item }: { item: InventoryItem }) {
  return (
    <div className="barcode-print-area">
      <article className="barcode-label">
        <div className="barcode-label-head">
          <div className="barcode-brand"><span>T</span><div><strong>TIDIGO</strong><small>FROM IDEAS TO 3D OBJECTS</small></div></div>
          <span>STOK FILAMEN</span>
        </div>
        <div className="barcode-product">
          <strong>{item.product}</strong>
          <span>{item.material} · {item.color} · {item.packagingType === "WITH_SPOOL" ? "With Spool" : "Refill"}</span>
        </div>
        <div className="barcode-visual"><BarcodeGraphic value={item.code} /></div>
        <div className="barcode-label-foot"><span>Sisa: {item.remainingGrams.toLocaleString("id-ID")} g</span><span>TIDIGO ERP</span></div>
      </article>
    </div>
  );
}

function InventoryView() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [query, setQuery] = useState("");
  const [material, setMaterial] = useState("ALL");
  const [status, setStatus] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [toast, setToast] = useState("");
  const [mode, setMode] = useState<"create" | "edit" | "view" | "label" | "delete" | null>(null);
  const [selected, setSelected] = useState<InventoryItem | null>(null);
  const [form, setForm] = useState<InventoryFormData>(emptyInventoryForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const loadItems = async () => {
    setLoading(true);
    setLoadError("");
    try {
      setItems(await fetchInventoryItems());
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Gagal memuat stok filamen.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    fetchInventoryItems()
      .then((nextItems) => { if (active) setItems(nextItems); })
      .catch((error: unknown) => { if (active) setLoadError(error instanceof Error ? error.message : "Gagal memuat stok filamen."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const materials = useMemo(() => Array.from(new Set(items.map((item) => item.material))).sort(), [items]);
  const filtered = useMemo(() => items.filter((item) => {
    const matchesQuery = `${item.code} ${item.product} ${item.color} ${item.supplier}`.toLowerCase().includes(query.toLowerCase());
    return matchesQuery && (material === "ALL" || item.material === material) && (status === "ALL" || item.status === status);
  }), [items, material, query, status]);

  const totalGrams = items.reduce((sum, item) => sum + item.remainingGrams, 0);
  const available = items.filter((item) => item.status === "AVAILABLE").length;
  const inUse = items.filter((item) => item.status === "IN_USE").length;
  const lowStock = items.filter((item) => item.remainingGrams > 0 && item.remainingGrams < 500).length;

  const closeDialog = () => { setMode(null); setSelected(null); setFormError(""); };
  const openCreate = () => { setForm(emptyInventoryForm); setSelected(null); setFormError(""); setMode("create"); };
  const openEdit = (item: InventoryItem) => {
    setSelected(item);
    setForm({ code: item.code, product: item.product, material: item.material, color: item.color, packagingType: item.packagingType, remainingGrams: item.remainingGrams, status: item.status, unitCost: item.unitCost, supplier: item.supplier });
    setFormError("");
    setMode("edit");
  };
  const openLabel = (item: InventoryItem) => { setSelected(item); setFormError(""); setMode("label"); };

  const saveItem = async () => {
    setSaving(true);
    setFormError("");
    try {
      const editing = mode === "edit" && selected;
      const response = await fetch(editing ? `/api/v1/inventory/${selected.id}` : "/api/v1/inventory", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Data gagal disimpan.");
      if (editing) {
        closeDialog();
        setToast(`${form.code} berhasil diperbarui.`);
      } else {
        const createdItem = data.item as InventoryItem;
        setSelected(createdItem);
        setFormError("");
        setMode("label");
        setToast(`${createdItem.code} berhasil ditambahkan. Label siap dicetak.`);
      }
      await loadItems();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Data gagal disimpan.");
    } finally {
      setSaving(false);
    }
  };

  const deleteItem = async () => {
    if (!selected) return;
    setSaving(true);
    setFormError("");
    try {
      const response = await fetch(`/api/v1/inventory/${selected.id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Data gagal dihapus.");
      const code = selected.code;
      closeDialog();
      setToast(`${code} berhasil dihapus.`);
      await loadItems();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Data gagal dihapus.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <ModuleHeading eyebrow="INVENTORY" title="Stok filamen" description="Kelola setiap spool dan refill hingga gram terakhir.">
        <button className="button secondary" onClick={() => void loadItems()} disabled={loading}><LoaderCircle className={loading ? "spin" : ""} size={17} /> Muat ulang</button>
        <button className="button primary" onClick={openCreate}><Plus size={17} /> Tambah filamen</button>
      </ModuleHeading>
      <section className="module-stats compact-stats">
        <article><span>Total unit</span><strong>{items.length}</strong><small>{(totalGrams / 1000).toLocaleString("id-ID", { maximumFractionDigits: 2 })} kg tersisa</small></article>
        <article><span>Tersedia</span><strong>{available}</strong><small>{items.length ? Math.round((available / items.length) * 100) : 0}% dari total</small></article>
        <article><span>Digunakan</span><strong>{inUse}</strong><small>unit berstatus digunakan</small></article>
        <article><span>Hampir habis</span><strong className="warning-copy">{lowStock}</strong><small>di bawah 500 gram</small></article>
      </section>
      <section className="data-panel">
        <div className="toolbar inventory-toolbar">
          <label className="table-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari kode, produk, warna, supplier..." /></label>
          <div className="toolbar-actions">
            <label className="toolbar-select"><Filter size={15} /><select aria-label="Filter material" value={material} onChange={(event) => setMaterial(event.target.value)}><option value="ALL">Semua material</option>{materials.map((item) => <option value={item} key={item}>{item}</option>)}</select></label>
            <label className="toolbar-select"><SlidersHorizontal size={15} /><select aria-label="Filter status" value={status} onChange={(event) => setStatus(event.target.value)}><option value="ALL">Semua status</option>{Object.entries(inventoryStatusLabels).map(([code, label]) => <option value={code} key={code}>{label}</option>)}</select></label>
          </div>
        </div>
        {loadError ? <div className="inventory-load-error"><AlertCircle size={21} /><div><strong>Stok belum dapat dimuat</strong><span>{loadError}</span></div><button className="button secondary" onClick={() => void loadItems()}>Coba lagi</button></div> : null}
        {!loadError ? <div className="table-wrap">
          <table className="data-table inventory-table">
            <thead><tr><th>Unit filamen</th><th>Material / Kemasan</th><th>Sisa</th><th>Status</th><th>Harga unit</th><th>Supplier</th><th>Aksi</th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={7}><div className="inventory-empty"><LoaderCircle className="spin" size={28} /><strong>Memuat stok...</strong></div></td></tr> : null}
              {!loading && !filtered.length ? <tr><td colSpan={7}><div className="inventory-empty"><span><PackageOpen size={30} /></span><strong>{items.length ? "Tidak ada hasil yang cocok" : "Belum ada data stok filamen"}</strong><p>{items.length ? "Ubah kata pencarian atau filter." : "Tambahkan unit filamen pertama untuk memulai inventory."}</p>{!items.length ? <button className="button primary" onClick={openCreate}><Plus size={16} /> Tambah filamen pertama</button> : null}</div></td></tr> : null}
              {!loading && filtered.map((item) => <tr key={item.id}>
                <td><div className="product-cell"><span className="product-token"><Barcode size={17} /></span><span><strong>{item.product}</strong><small>{item.code} · {item.color}</small></span></div></td>
                <td><strong className="cell-main">{item.material}</strong><small className="cell-sub">{item.packagingType === "WITH_SPOOL" ? "With Spool" : "Refill"}</small></td>
                <td><div className="weight-cell"><strong>{item.remainingGrams.toLocaleString("id-ID")} g</strong><div><i style={{ width: `${Math.min(100, item.remainingGrams / 10)}%` }} /></div></div></td>
                <td><Status>{inventoryStatusLabels[item.status]}</Status></td><td>{rupiah.format(item.unitCost)}</td><td>{item.supplier}</td>
                <td><div className="row-actions"><button className="table-action" onClick={() => { setSelected(item); setMode("view"); }} aria-label={`Lihat ${item.code}`} title="Lihat"><Eye size={15} /></button><button className="table-action" onClick={() => openLabel(item)} aria-label={`Cetak label ${item.code}`} title="Cetak label"><Printer size={15} /></button><button className="table-action" onClick={() => openEdit(item)} aria-label={`Ubah ${item.code}`} title="Ubah"><Pencil size={15} /></button><button className="table-action danger" onClick={() => { setSelected(item); setFormError(""); setMode("delete"); }} aria-label={`Hapus ${item.code}`} title="Hapus"><Trash2 size={15} /></button></div></td>
              </tr>)}
            </tbody>
          </table>
        </div> : null}
        {!loadError ? <div className="table-footer"><span>Menampilkan {filtered.length} dari {items.length} unit</span><span>Data tersimpan di database</span></div> : null}
      </section>

      {mode === "create" || mode === "edit" ? <InventoryDialog eyebrow={mode === "create" ? "UNIT BARU" : "PERBARUI UNIT"} title={mode === "create" ? "Tambah stok filamen" : `Ubah ${selected?.code ?? "filamen"}`} onClose={closeDialog}><InventoryForm value={form} saving={saving} error={formError} onChange={setForm} onCancel={closeDialog} onSubmit={() => void saveItem()} /></InventoryDialog> : null}
      {mode === "view" && selected ? <InventoryDialog eyebrow="DETAIL UNIT" title={selected.code} onClose={closeDialog}><div className="inventory-detail"><div className="detail-hero"><span className="product-token"><Barcode size={22} /></span><div><strong>{selected.product}</strong><small>{selected.material} · {selected.color}</small></div><Status>{inventoryStatusLabels[selected.status]}</Status></div><dl><div><dt>Kemasan</dt><dd>{selected.packagingType === "WITH_SPOOL" ? "With Spool" : "Refill"}</dd></div><div><dt>Sisa stok</dt><dd>{selected.remainingGrams.toLocaleString("id-ID")} gram</dd></div><div><dt>Harga unit</dt><dd>{rupiah.format(selected.unitCost)}</dd></div><div><dt>Supplier</dt><dd>{selected.supplier}</dd></div><div><dt>Terakhir diubah</dt><dd>{new Date(selected.updatedAt).toLocaleString("id-ID")}</dd></div></dl></div><div className="dialog-actions"><button className="button secondary danger-button" onClick={() => setMode("delete")}><Trash2 size={16} /> Hapus</button><button className="button secondary" onClick={() => openLabel(selected)}><Printer size={16} /> Cetak label</button><button className="button primary" onClick={() => openEdit(selected)}><Pencil size={16} /> Ubah data</button></div></InventoryDialog> : null}
      {mode === "label" && selected ? <InventoryDialog eyebrow="LABEL SIAP CETAK" title={selected.code} onClose={closeDialog}><div className="label-ready-note"><CheckCircle2 size={18} /><div><strong>Barcode Code 128 sudah dibuat.</strong><span>Gunakan kertas label 100 × 50 mm, lalu pilih skala 100% pada pengaturan printer.</span></div></div><PrintableBarcodeLabel item={selected} /><div className="dialog-actions"><button className="button secondary" onClick={closeDialog}>Selesai</button><button className="button primary" onClick={() => window.print()}><Printer size={16} /> Cetak label</button></div></InventoryDialog> : null}
      {mode === "delete" && selected ? <InventoryDialog eyebrow="KONFIRMASI" title={`Hapus ${selected.code}?`} onClose={closeDialog}><div className="delete-copy"><span><Trash2 size={22} /></span><div><strong>Data akan dihapus permanen.</strong><p>Unit {selected.product} tidak akan tampil lagi di stok filamen.</p></div></div>{formError ? <div className="inventory-form-error" role="alert"><AlertCircle size={16} />{formError}</div> : null}<div className="dialog-actions"><button className="button secondary" onClick={closeDialog} disabled={saving}>Batal</button><button className="button danger-button solid" onClick={() => void deleteItem()} disabled={saving}>{saving ? <><LoaderCircle className="spin" size={16} /> Menghapus...</> : <><Trash2 size={16} /> Hapus permanen</>}</button></div></InventoryDialog> : null}
      {toast ? <Toast text={toast} onClose={() => setToast("")} /> : null}
    </>
  );
}

function UsageStartView({ onNavigate }: { onNavigate: (view: ViewId) => void }) {
  const [userName, setUserName] = useState("");
  const [usageType, setUsageType] = useState<"CLASS" | "NON_CLASS">("CLASS");
  const [nonClassType, setNonClassType] = useState<"TRIAL_PRINT" | "SAMPLE">("TRIAL_PRINT");
  const [scanned, setScanned] = useState<InventoryItem[]>([]);
  const [code, setCode] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [toast, setToast] = useState("");
  const addUnit = async (scannedCode = code) => {
    const normalizedCode = scannedCode.trim().toUpperCase();
    if (!normalizedCode) return;
    setLookingUp(true);
    try {
      const items = await fetchInventoryItems();
      const next = items.find((item) => item.code.toUpperCase() === normalizedCode);
      if (!next) {
        setToast(`Unit ${normalizedCode} tidak ditemukan di Stok Filamen.`);
        return;
      }
      if (!["AVAILABLE", "LOW_STOCK"].includes(next.status)) {
        setToast(`Unit ${next.code} tidak dapat digunakan karena statusnya ${inventoryStatusLabels[next.status].toLowerCase()}.`);
        return;
      }
      if (scanned.some((item) => item.id === next.id)) {
        setToast(`Unit ${next.code} sudah ada dalam daftar.`);
        return;
      }
      setScanned((current) => [...current, next]);
      setToast(`Unit ${next.code} berhasil ditambahkan.`);
      setCode("");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Barcode belum dapat diperiksa.");
    } finally {
      setLookingUp(false);
    }
  };
  const handleCameraScan = (value: string) => { setCameraOpen(false); setCode(value.toUpperCase()); void addUnit(value); };
  const confirmUsage = async () => {
    const cleanName = userName.trim();
    if (cleanName.length < 2) {
      setFormError("Masukkan nama pengambil minimal 2 karakter.");
      return;
    }
    if (!scanned.length) {
      setFormError("Scan minimal satu unit filamen sebelum konfirmasi.");
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      const response = await fetch("/api/v1/usages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userName: cleanName,
          usageType,
          nonClassType: usageType === "NON_CLASS" ? nonClassType : null,
          inventoryItemIds: scanned.map((item) => item.id),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Penggunaan belum dapat dikonfirmasi.");
      onNavigate("usage-active");
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Penggunaan belum dapat dikonfirmasi.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <>
      <ModuleHeading eyebrow="PENGGUNAAN · CHECK-OUT" title="Mulai penggunaan" description="Scan unit, isi pengambil dan jenis penggunaan, lalu konfirmasi." />
      <div className="workflow-grid">
        <section className="form-panel">
          <div className="section-title"><div><h2>1. Scan barcode unit</h2><p>Kamera PC, kamera HP, dan scanner USB siap digunakan.</p></div></div>
          <div className="large-scan-zone usage-scan-zone"><ScanBarcode size={44} /><strong>Scan unit filamen</strong><p>Arahkan kamera ke label unit atau masukkan kode secara manual.</p><button className="usage-camera-button" onClick={() => setCameraOpen(true)}><Camera size={17} /> Buka kamera untuk scan</button><div><input value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} onKeyDown={(event) => { if (event.key === "Enter") void addUnit(); }} placeholder="FLM-2609-ABC123-01-01" /><button onClick={() => void addUnit()} disabled={lookingUp}>{lookingUp ? <LoaderCircle className="spin" size={15} /> : null} Tambahkan</button></div></div>
          <div className="section-divider" />
          <div className="section-title"><div><h2>2. Identitas & jenis penggunaan</h2><p>Data ini akan tampil pada Penggunaan Aktif dan tersimpan di database.</p></div><ShieldCheck size={20} /></div>
          <label className="stack-field usage-name-field"><span>Nama pengambil *</span><input required maxLength={120} value={userName} onChange={(event) => { setUserName(event.target.value); setFormError(""); }} placeholder="Masukkan nama pengguna" /></label>
          <div className="segmented"><button className={usageType === "CLASS" ? "active" : ""} onClick={() => setUsageType("CLASS")}>Kelas</button><button className={usageType === "NON_CLASS" ? "active" : ""} onClick={() => setUsageType("NON_CLASS")}>Nonkelas</button></div>
          {usageType === "NON_CLASS" ? <div className="inline-field"><label><input type="radio" name="nonclass" checked={nonClassType === "TRIAL_PRINT"} onChange={() => setNonClassType("TRIAL_PRINT")} /> Trial Print</label><label><input type="radio" name="nonclass" checked={nonClassType === "SAMPLE"} onChange={() => setNonClassType("SAMPLE")} /> Sample</label></div> : <div className="info-strip"><CheckCircle2 size={17} /> Penggunaan dicatat sebagai kegiatan Kelas.</div>}
        </section>
        <aside className="scan-cart">
          <div className="section-title"><div><h2>Unit yang di-scan</h2><p>{scanned.length} unit siap digunakan</p></div><span className="count-badge">{scanned.length}</span></div>
          <div className="cart-list">{scanned.length ? scanned.map((unit, index) => <div className="cart-item" key={unit.id}><span className="slot">{index + 1}</span><span><strong>{unit.product}</strong><small>{unit.code} · {unit.color}</small><em>{unit.remainingGrams.toLocaleString("id-ID")} gram tersisa</em></span><button onClick={() => setScanned(scanned.filter((item) => item.id !== unit.id))} aria-label={`Hapus ${unit.code}`}><X size={16} /></button></div>) : <div className="scan-cart-empty"><ScanBarcode size={25} /><strong>Belum ada unit</strong><span>Scan label pada spool atau refill.</span></div>}</div>
          <div className="cart-summary"><span>Total estimasi tersedia</span><strong>{scanned.reduce((sum, unit) => sum + unit.remainingGrams, 0).toLocaleString("id-ID")} gram</strong></div>
          {formError ? <div className="inventory-form-error" role="alert"><AlertCircle size={16} />{formError}</div> : null}
          <p className="usage-confirm-note"><ShieldCheck size={15} /> Setelah dikonfirmasi, sesi masuk ke Penggunaan Aktif dan unit berubah menjadi Digunakan.</p>
          <button className="button primary full" disabled={!scanned.length || userName.trim().length < 2 || saving} onClick={() => void confirmUsage()}>{saving ? <><LoaderCircle className="spin" size={17} /> Menyimpan...</> : <><ScanBarcode size={17} /> Konfirmasi pengambilan</>}</button>
        </aside>
      </div>
      {cameraOpen ? <CameraBarcodeScanner contextLabel="PEMINDAI UNIT" onDetected={handleCameraScan} onClose={() => setCameraOpen(false)} /> : null}
      {toast ? <Toast text={toast} onClose={() => setToast("")} /> : null}
    </>
  );
}

function usageTypeLabel(session: UsageSessionSummary) {
  if (session.usageType === "CLASS") return "Kelas";
  return session.nonClassType === "SAMPLE" ? "Sample" : "Trial Print";
}

function elapsedSince(value: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 60) return `${minutes} menit`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}j ${rest}m` : `${hours} jam`;
}

function ActiveUsageView({ onNavigate }: { onNavigate: NavigateView }) {
  const [sessions, setSessions] = useState<UsageSessionSummary[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const loadSessions = async () => {
    setLoading(true);
    setLoadError("");
    try {
      setSessions(await fetchActiveUsageSessions());
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Gagal memuat penggunaan aktif.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let ignore = false;
    fetchActiveUsageSessions()
      .then((items) => { if (!ignore) setSessions(items); })
      .catch((error) => { if (!ignore) setLoadError(error instanceof Error ? error.message : "Gagal memuat penggunaan aktif."); })
      .finally(() => { if (!ignore) setLoading(false); });
    return () => { ignore = true; };
  }, []);

  const query = search.trim().toLowerCase();
  const visibleSessions = sessions.filter((session) => !query || session.number.toLowerCase().includes(query) || session.userName.toLowerCase().includes(query));
  const classSessions = sessions.filter((session) => session.usageType === "CLASS");
  const trialSessions = sessions.filter((session) => session.nonClassType === "TRIAL_PRINT");
  const sampleSessions = sessions.filter((session) => session.nonClassType === "SAMPLE");
  const unitTotal = sessions.reduce((sum, session) => sum + session.unitCount, 0);
  return (
    <>
      <ModuleHeading eyebrow="PENGGUNAAN" title="Penggunaan aktif" description="Sesi yang sudah dikonfirmasi dan unit yang sedang berada di luar penyimpanan."><button className="button primary" onClick={() => onNavigate("usage-start")}><Plus size={17} /> Mulai penggunaan</button></ModuleHeading>
      <section className="module-stats"><article><span>Sesi aktif</span><strong>{sessions.length}</strong><small>{unitTotal} unit filamen</small></article><article><span>Kelas</span><strong>{classSessions.length}</strong><small>{classSessions.reduce((sum, session) => sum + session.unitCount, 0)} unit</small></article><article><span>Trial Print</span><strong>{trialSessions.length}</strong><small>{trialSessions.reduce((sum, session) => sum + session.unitCount, 0)} unit</small></article><article><span>Sample</span><strong>{sampleSessions.length}</strong><small>{sampleSessions.reduce((sum, session) => sum + session.unitCount, 0)} unit</small></article></section>
      <section className="data-panel"><div className="toolbar"><label className="table-search"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari nomor penggunaan atau pengguna..." /></label><button className="mini-button" onClick={() => void loadSessions()} disabled={loading}>{loading ? <LoaderCircle className="spin" size={15} /> : null} Muat ulang</button></div>{loadError ? <div className="inventory-load-error"><AlertCircle size={24} /><div><strong>Data belum dapat dimuat</strong><span>{loadError}</span></div><button className="mini-button" onClick={() => void loadSessions()}>Coba lagi</button></div> : <div className="table-wrap"><table className="data-table"><thead><tr><th>Nomor penggunaan</th><th>Pengambil</th><th>Jenis</th><th>Mulai</th><th>Unit</th><th>Durasi</th><th>Status</th><th>Aksi</th></tr></thead><tbody>{loading ? <tr><td colSpan={8}><div className="inventory-empty"><LoaderCircle className="spin" size={26} /><strong>Memuat penggunaan aktif...</strong></div></td></tr> : visibleSessions.length ? visibleSessions.map((session) => <tr key={session.id}><td><strong className="cell-main">{session.number}</strong></td><td>{session.userName}</td><td>{usageTypeLabel(session)}</td><td>{new Date(session.startedAt).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}</td><td>{session.unitCount} unit</td><td>{elapsedSince(session.startedAt)}</td><td><Status>Aktif</Status></td><td><button className="mini-button" onClick={() => onNavigate("usage-complete", session.id)}><ClipboardCheck size={14} /> Selesaikan</button></td></tr>) : <tr><td colSpan={8}><div className="inventory-empty"><span><ScanBarcode size={25} /></span><strong>{query ? "Penggunaan tidak ditemukan" : "Belum ada penggunaan aktif"}</strong><p>{query ? "Coba kata pencarian lain." : "Sesi yang dikonfirmasi dari menu Mulai Penggunaan akan tampil di sini."}</p></div></td></tr>}</tbody></table></div>}</section>
    </>
  );
}


function ReportsView({ ledgerOnly = false }: { ledgerOnly?: boolean }) {
  const downloadCsv = (type: string) => {
    const csv = `Tanggal,Barcode,Jenis,Referensi,Perubahan,Saldo Sebelum,Saldo Setelah,User\n${ledger.map((row) => `${row.time},${row.code},${row.type},${row.ref},${row.change},${row.before},${row.after},${row.user}`).join("\n")}`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${type}-tidigo.csv`; anchor.click(); URL.revokeObjectURL(url);
  };
  return (
    <>
      <ModuleHeading eyebrow={ledgerOnly ? "INVENTORY · LEDGER" : "PELAPORAN"} title={ledgerOnly ? "Riwayat pergerakan stok" : "Laporan"} description={ledgerOnly ? "Jejak setiap perubahan gram yang tidak dapat dihapus." : "Empat laporan prioritas untuk kontrol stok dan biaya."}>
        <button className="button secondary" onClick={() => downloadCsv(ledgerOnly ? "ledger" : "laporan")}><Download size={17} /> Ekspor CSV</button>
      </ModuleHeading>
      {!ledgerOnly ? <section className="report-grid">{[
        ["Stok saat ini", "167 unit · 128,4 kg", Weight, "Nilai dan posisi stok terkini"],
        ["Penggunaan", "65 transaksi bulan ini", ScanBarcode, "Gram, biaya, hasil pekerjaan"],
        ["Barang masuk", "3 penerimaan bulan ini", PackagePlus, "Supplier dan landed cost"],
        ["Pergerakan stok", "2.184 baris ledger", History, "Jejak saldo per unit"],
      ].map(([title, stat, Icon, text]) => <article className="report-card" key={String(title)}><span className="report-icon"><Icon size={21} /></span><div><h2>{String(title)}</h2><strong>{String(stat)}</strong><p>{String(text)}</p></div><button onClick={() => downloadCsv(String(title).toLowerCase().replaceAll(" ", "-"))}><FileSpreadsheet size={16} /> CSV</button></article>)}</section> : null}
      <section className="data-panel ledger-panel"><div className="toolbar"><div><strong>Pergerakan terbaru</strong><small>Ledger bersifat append-only</small></div><div className="toolbar-actions"><button><Filter size={16} /> Filter</button><button onClick={() => downloadCsv("pergerakan-stok")}><Download size={16} /> Ekspor</button></div></div><div className="table-wrap"><table className="data-table"><thead><tr><th>Waktu</th><th>Barcode unit</th><th>Jenis</th><th>Referensi</th><th>Perubahan</th><th>Saldo sebelum</th><th>Saldo setelah</th><th>Pengguna</th></tr></thead><tbody>{ledger.map((row) => <tr key={`${row.time}-${row.code}`}><td>{row.time}</td><td><code>{row.code}</code></td><td>{row.type}</td><td>{row.ref}</td><td className={row.change.startsWith("+") ? "positive-copy" : "negative-copy"}>{row.change}</td><td>{row.before}</td><td><strong>{row.after}</strong></td><td>{row.user}</td></tr>)}</tbody></table></div></section>
    </>
  );
}

function UsersView() {
  const people = [{ name: "Admin TIDIGO", email: "admin@example.test", account: "Staff", role: "Super Admin", last: "Hari ini, 10:58" }, { name: "Admin Demo", email: "inventory@example.test", account: "Staff", role: "Admin Inventory", last: "Hari ini, 09:56" }, { name: "Operator Demo 1", email: "operator1@example.test", account: "Coach", role: "Operator", last: "Hari ini, 10:18" }, { name: "Operator Demo 2", email: "operator2@example.test", account: "Coach", role: "Operator", last: "Hari ini, 09:42" }];
  return <><ModuleHeading eyebrow="ADMINISTRATION" title="Pengguna & role" description="Identitas dari MLS, hak akses dikelola di ERP."><button className="button secondary"><Users size={17} /> Sinkronkan MLS</button></ModuleHeading><section className="access-note"><ShieldCheck size={20} /><span><strong>Akses siswa selalu ditolak.</strong><small>Role dicek di backend pada setiap permintaan.</small></span></section><section className="data-panel"><div className="toolbar"><label className="table-search"><Search size={17} /><input placeholder="Cari nama atau email..." /></label></div><div className="table-wrap"><table className="data-table"><thead><tr><th>Pengguna</th><th>Tipe akun MLS</th><th>Role ERP</th><th>Login terakhir</th><th>Status</th></tr></thead><tbody>{people.map((person) => <tr key={person.email}><td><div className="product-cell"><span className="avatar soft">{person.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</span><span><strong>{person.name}</strong><small>{person.email}</small></span></div></td><td>{person.account}</td><td><select className="role-select" defaultValue={person.role}><option>Operator</option><option>Admin Inventory</option><option>Supervisor</option><option>Super Admin</option></select></td><td>{person.last}</td><td><Status>Aktif</Status></td></tr>)}</tbody></table></div></section></>;
}

function SettingsView() {
  return <><ModuleHeading eyebrow="ADMINISTRATION" title="Pengaturan sistem" description="Konfigurasi lokasi, label, dan batas stok."><button className="button primary"><Check size={17} /> Simpan perubahan</button></ModuleHeading><div className="settings-grid"><section className="form-panel"><div className="section-title"><div><h2>Aturan inventory</h2><p>Berlaku untuk seluruh unit filamen.</p></div><SlidersHorizontal size={20} /></div><div className="form-grid"><label><span>Batas hampir habis (gram)</span><input type="number" defaultValue="500" /></label><label><span>Berat nominal unit (gram)</span><input type="number" defaultValue="1000" disabled /></label><label><span>Lokasi default</span><select><option>Gudang Filamen Utama</option></select></label><label><span>Zona waktu</span><select><option>Asia/Jakarta (WIB)</option></select></label></div></section><section className="form-panel"><div className="section-title"><div><h2>Format label</h2><p>Default untuk PDF barcode Code 128.</p></div><Printer size={20} /></div><div className="label-preview"><Barcode size={80} strokeWidth={1} /><strong>FLM-2609-0018</strong><small>Bambu Lab PLA Basic · Matte Black</small></div><div className="form-grid"><label><span>Ukuran kertas</span><select><option>A4 · 24 label</option><option>A4 · 40 label</option></select></label><label><span>Tipe barcode</span><select disabled><option>Code 128</option></select></label></div></section></div></>;
}

export function ModuleView({ view, onNavigate, usageSessionId }: { view: ViewId; onNavigate: NavigateView; usageSessionId: string | null }) {
  if (view === "inventory") return <InventoryView />;
  if (view === "receipt") return <ReceiptView />;
  if (view === "usage-start") return <UsageStartView onNavigate={onNavigate} />;
  if (view === "usage-active") return <ActiveUsageView onNavigate={onNavigate} />;
  if (view === "usage-complete") return <CompleteUsageView key={usageSessionId ?? "choose-session"} initialSessionId={usageSessionId} onOpenActive={() => onNavigate("usage-active")} />;
  if (view === "reports") return <ReportsView />;
  if (view === "history") return <ReportsView ledgerOnly />;
  if (view === "users") return <UsersView />;
  return <SettingsView />;
}
