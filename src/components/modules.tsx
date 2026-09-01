"use client";

import {
  ArrowUpRight,
  Barcode,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  ClipboardCheck,
  Download,
  FileSpreadsheet,
  Filter,
  History,
  PackageCheck,
  PackagePlus,
  Plus,
  Printer,
  ReceiptText,
  RotateCcw,
  ScanBarcode,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Users,
  Weight,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";

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

const units = [
  { code: "FLM-2609-0018", product: "Bambu Lab PLA Basic", material: "PLA", color: "Jade White", pack: "With Spool", grams: 1000, status: "Tersedia", cost: "Rp189.000", supplier: "PT Kreasi 3D" },
  { code: "FLM-2608-0148", product: "Bambu Lab PLA Basic", material: "PLA", color: "Matte Black", pack: "Refill", grams: 812, status: "Digunakan", cost: "Rp172.500", supplier: "PT Kreasi 3D" },
  { code: "FLM-2608-0142", product: "Bambu Lab PLA Basic", material: "PLA", color: "Matte Black", pack: "With Spool", grams: 148, status: "Hampir Habis", cost: "Rp188.000", supplier: "PT Kreasi 3D" },
  { code: "FLM-2608-0098", product: "eSUN PETG+HS", material: "PETG", color: "Fire Engine Red", pack: "With Spool", grams: 236, status: "Hampir Habis", cost: "Rp214.000", supplier: "Mitra Filamen" },
  { code: "FLM-2607-0211", product: "Polymaker PolyTerra", material: "PLA", color: "Muted White", pack: "With Spool", grams: 381, status: "Hampir Habis", cost: "Rp229.000", supplier: "Filament Hub" },
  { code: "FLM-2607-0204", product: "Polymaker PolyLite", material: "ABS", color: "Army Green", pack: "With Spool", grams: 672, status: "Tersedia", cost: "Rp238.000", supplier: "Filament Hub" },
];

const activeSessions = [
  { number: "USE-260901-012", user: "Operator Demo 1", type: "Kelas", started: "10:18", units: 2, elapsed: "42 menit", status: "Aktif" },
  { number: "USE-260901-011", user: "Operator Demo 2", type: "Trial Print", started: "09:42", units: 1, elapsed: "1j 18m", status: "Aktif" },
  { number: "USE-260901-009", user: "Operator Demo 3", type: "Sample", started: "08:54", units: 3, elapsed: "2j 06m", status: "Aktif" },
  { number: "USE-260901-007", user: "Operator Demo 4", type: "Kelas", started: "08:26", units: 2, elapsed: "2j 34m", status: "Aktif" },
];

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

function InventoryView() {
  const [query, setQuery] = useState("");
  const [toast, setToast] = useState("");
  const filtered = useMemo(() => units.filter((unit) => `${unit.code} ${unit.product} ${unit.color}`.toLowerCase().includes(query.toLowerCase())), [query]);
  return (
    <>
      <ModuleHeading eyebrow="INVENTORY" title="Stok filamen" description="Pantau setiap spool dan refill hingga gram terakhir.">
        <button className="button secondary" onClick={() => setToast("Form koreksi stok dibuka untuk Admin Inventory.")}><RotateCcw size={17} /> Koreksi stok</button>
        <button className="button primary" onClick={() => setToast("Form produk baru siap diisi.")}><Plus size={17} /> Tambah produk</button>
      </ModuleHeading>
      <section className="module-stats compact-stats">
        <article><span>Total unit</span><strong>167</strong><small>128,4 kg tersisa</small></article>
        <article><span>Tersedia</span><strong>155</strong><small>93% dari total</small></article>
        <article><span>Digunakan</span><strong>12</strong><small>oleh 8 operator</small></article>
        <article><span>Hampir habis</span><strong className="warning-copy">9</strong><small>di bawah 500 gram</small></article>
      </section>
      <section className="data-panel">
        <div className="toolbar">
          <label className="table-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari barcode, produk, warna..." /></label>
          <div className="toolbar-actions"><button><Filter size={16} /> Material</button><button><SlidersHorizontal size={16} /> Semua status</button></div>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Unit filamen</th><th>Material / Kemasan</th><th>Sisa</th><th>Status</th><th>Harga unit</th><th>Supplier</th><th aria-label="Aksi" /></tr></thead>
            <tbody>{filtered.map((unit) => <tr key={unit.code}>
              <td><div className="product-cell"><span className="product-token"><Barcode size={17} /></span><span><strong>{unit.product}</strong><small>{unit.code} · {unit.color}</small></span></div></td>
              <td><strong className="cell-main">{unit.material}</strong><small className="cell-sub">{unit.pack}</small></td>
              <td><div className="weight-cell"><strong>{unit.grams.toLocaleString("id-ID")} g</strong><div><i style={{ width: `${unit.grams / 10}%` }} /></div></div></td>
              <td><Status>{unit.status}</Status></td><td>{unit.cost}</td><td>{unit.supplier}</td>
              <td><button className="table-action" onClick={() => setToast(`Detail ${unit.code} dibuka.`)}><ChevronRight size={17} /></button></td>
            </tr>)}</tbody>
          </table>
        </div>
        <div className="table-footer"><span>Menampilkan {filtered.length} dari 167 unit</span><div><button disabled>←</button><button className="current">1</button><button>2</button><button>3</button><button>→</button></div></div>
      </section>
      {toast ? <Toast text={toast} onClose={() => setToast("")} /> : null}
    </>
  );
}

function ReceiptView() {
  const [finalized, setFinalized] = useState(false);
  return (
    <>
      <ModuleHeading eyebrow="INVENTORY · BARANG MASUK" title="Catat barang masuk" description="Satu finalisasi akan membentuk unit, ledger, dan label barcode.">
        <button className="button secondary"><History size={17} /> Riwayat penerimaan</button>
      </ModuleHeading>
      <ol className="steps"><li className="done"><i><Check size={14} /></i><span>Informasi pembelian</span></li><li className="active"><i>2</i><span>Produk & jumlah</span></li><li><i>3</i><span>Tinjau biaya</span></li><li><i>4</i><span>Finalisasi</span></li></ol>
      <div className="receipt-grid">
        <section className="form-panel">
          <div className="section-title"><div><h2>Informasi supplier & invoice</h2><p>Data sumber pembelian dan dokumen pendukung.</p></div><ReceiptText size={20} /></div>
          <div className="form-grid">
            <label><span>Supplier</span><select defaultValue="PT Kreasi 3D"><option>PT Kreasi 3D</option><option>Mitra Filamen</option><option>Filament Hub</option></select></label>
            <label><span>Nomor invoice</span><input defaultValue="INV-K3D-2609-018" /></label>
            <label><span>Tanggal pembelian</span><input type="date" defaultValue="2026-09-01" /></label>
            <label><span>Tanggal diterima</span><input type="date" defaultValue="2026-09-01" /></label>
          </div>
          <div className="section-divider" />
          <div className="section-title"><div><h2>Produk yang diterima</h2><p>Scan barcode produk atau pilih master produk.</p></div><button className="mini-button"><ScanBarcode size={15} /> Scan produk</button></div>
          <div className="receipt-item">
            <span className="item-index">01</span>
            <div className="receipt-product"><strong>Bambu Lab PLA Basic</strong><small>PLA · Matte Black · With Spool</small><code>6975337031170</code></div>
            <label><span>Jumlah</span><input type="number" defaultValue="8" min="1" /></label>
            <label><span>Harga / unit</span><input defaultValue="188000" /></label>
            <button className="table-action" aria-label="Hapus produk"><X size={16} /></button>
          </div>
          <button className="add-row"><Plus size={16} /> Tambah produk lain</button>
        </section>
        <aside className="summary-panel">
          <div className="section-title"><div><h2>Ringkasan biaya</h2><p>Alokasi landed cost otomatis.</p></div><CircleDollarSign size={20} /></div>
          <dl className="cost-list"><div><dt>Subtotal barang</dt><dd>Rp1.504.000</dd></div><div><dt>Diskon</dt><dd>− Rp75.200</dd></div><div><dt>Pajak</dt><dd>Rp157.168</dd></div><div><dt>Ongkir</dt><dd>Rp45.000</dd></div><div className="total"><dt>Total landed cost</dt><dd>Rp1.630.968</dd></div></dl>
          <div className="unit-cost"><span>Biaya per unit</span><strong>Rp203.871</strong><small>Rp203,87 per gram</small></div>
          <div className="summary-note"><PackageCheck size={18} /><span><strong>8 unit baru</strong> akan dibuat dengan berat awal 1.000 gram per unit.</span></div>
          <button className="button primary full" onClick={() => setFinalized(true)} disabled={finalized}>{finalized ? <><CheckCircle2 size={17} /> 8 label siap diunduh</> : <>Tinjau & finalisasi <ArrowUpRight size={16} /></>}</button>
          {finalized ? <button className="button secondary full"><Printer size={16} /> Unduh PDF label</button> : null}
        </aside>
      </div>
      {finalized ? <Toast text="Barang masuk RCV-260901-003 berhasil difinalisasi." onClose={() => setFinalized(false)} /> : null}
    </>
  );
}

function UsageStartView() {
  const [usageType, setUsageType] = useState<"CLASS" | "NON_CLASS">("CLASS");
  const [scanned, setScanned] = useState([units[0]]);
  const [code, setCode] = useState("");
  const [toast, setToast] = useState("");
  const addUnit = () => {
    const next = units.find((unit) => unit.code.toLowerCase() === code.trim().toLowerCase()) ?? units[5];
    if (!scanned.some((unit) => unit.code === next.code)) setScanned([...scanned, next]);
    setCode("");
  };
  return (
    <>
      <ModuleHeading eyebrow="PENGGUNAAN · CHECK-OUT" title="Mulai penggunaan" description="Scan unit yang akan dibawa ke printer.">
        <div className="identity-pill"><span className="avatar soft">AT</span><span><small>Pengambil otomatis</small><strong>Admin TIDIGO</strong></span><ShieldCheck size={17} /></div>
      </ModuleHeading>
      <div className="workflow-grid">
        <section className="form-panel">
          <div className="section-title"><div><h2>1. Tujuan penggunaan</h2><p>Pilih kategori agar biaya tercatat pada laporan yang tepat.</p></div></div>
          <div className="segmented"><button className={usageType === "CLASS" ? "active" : ""} onClick={() => setUsageType("CLASS")}>Kelas</button><button className={usageType === "NON_CLASS" ? "active" : ""} onClick={() => setUsageType("NON_CLASS")}>Nonkelas</button></div>
          {usageType === "NON_CLASS" ? <div className="inline-field"><label><input type="radio" name="nonclass" defaultChecked /> Trial Print</label><label><input type="radio" name="nonclass" /> Sample</label></div> : <div className="info-strip"><CheckCircle2 size={17} /> Detail kelas dan siswa tidak diperlukan pada MVP.</div>}
          <div className="section-divider" />
          <div className="section-title"><div><h2>2. Scan barcode unit</h2><p>Scanner USB siap menerima input dan Enter.</p></div></div>
          <div className="large-scan-zone"><ScanBarcode size={44} /><strong>Scan unit filamen</strong><p>Gunakan scanner USB atau masukkan kode secara manual.</p><div><input value={code} onChange={(event) => setCode(event.target.value)} onKeyDown={(event) => event.key === "Enter" && addUnit()} placeholder="FLM-2608-0142" /><button onClick={addUnit}>Tambahkan</button></div></div>
        </section>
        <aside className="scan-cart">
          <div className="section-title"><div><h2>Unit yang di-scan</h2><p>{scanned.length} unit siap digunakan</p></div><span className="count-badge">{scanned.length}</span></div>
          <div className="cart-list">{scanned.map((unit, index) => <div className="cart-item" key={unit.code}><span className="slot">{index + 1}</span><span><strong>{unit.product}</strong><small>{unit.code} · {unit.color}</small><em>{unit.grams.toLocaleString("id-ID")} gram tersisa</em></span><button onClick={() => setScanned(scanned.filter((item) => item.code !== unit.code))}><X size={16} /></button></div>)}</div>
          <div className="cart-summary"><span>Total estimasi tersedia</span><strong>{scanned.reduce((sum, unit) => sum + unit.grams, 0).toLocaleString("id-ID")} gram</strong></div>
          <button className="button primary full" disabled={!scanned.length} onClick={() => setToast(`Penggunaan ${usageType === "CLASS" ? "Kelas" : "Nonkelas"} berhasil dimulai.`)}><ScanBarcode size={17} /> Konfirmasi pengambilan</button>
        </aside>
      </div>
      {toast ? <Toast text={toast} onClose={() => setToast("")} /> : null}
    </>
  );
}

function ActiveUsageView() {
  return (
    <>
      <ModuleHeading eyebrow="PENGGUNAAN" title="Penggunaan aktif" description="Unit yang sedang berada di luar penyimpanan."><button className="button primary"><Plus size={17} /> Mulai penggunaan</button></ModuleHeading>
      <section className="module-stats"><article><span>Sesi aktif</span><strong>8</strong><small>12 unit filamen</small></article><article><span>Kelas</span><strong>5</strong><small>8 unit</small></article><article><span>Trial Print</span><strong>2</strong><small>2 unit</small></article><article><span>Sample</span><strong>1</strong><small>2 unit</small></article></section>
      <section className="data-panel"><div className="toolbar"><label className="table-search"><Search size={17} /><input placeholder="Cari nomor penggunaan atau pengguna..." /></label><button className="mini-button"><Filter size={15} /> Filter</button></div><div className="table-wrap"><table className="data-table"><thead><tr><th>Nomor penggunaan</th><th>Pengambil</th><th>Jenis</th><th>Mulai</th><th>Unit</th><th>Durasi</th><th>Status</th><th /></tr></thead><tbody>{activeSessions.map((session) => <tr key={session.number}><td><strong className="cell-main">{session.number}</strong></td><td>{session.user}</td><td>{session.type}</td><td>{session.started}</td><td>{session.units} unit</td><td>{session.elapsed}</td><td><Status>{session.status}</Status></td><td><button className="table-action"><ChevronRight size={17} /></button></td></tr>)}</tbody></table></div></section>
    </>
  );
}

function CompleteUsageView() {
  const [usedA, setUsedA] = useState(124.5);
  const [usedB, setUsedB] = useState(0);
  const [done, setDone] = useState(false);
  const total = usedA + usedB;
  return (
    <>
      <ModuleHeading eyebrow="PENGGUNAAN · CHECK-IN" title="Selesaikan penggunaan" description="Scan ulang seluruh unit, lalu masukkan hasil slicing." />
      <div className="complete-search"><ScanBarcode size={24} /><span><strong>Cari sesi dari barcode pertama</strong><small>Scanner siap menerima input</small></span><input defaultValue="FLM-2608-0148" /><button>Cari sesi</button></div>
      <div className="complete-grid">
        <section className="form-panel">
          <div className="session-banner"><span><small>SESI DITEMUKAN</small><strong>USE-260901-011</strong></span><span><small>PENGAMBIL</small><strong>Operator Demo 2</strong></span><span><small>TUJUAN</small><strong>Trial Print</strong></span><Status>Aktif</Status></div>
          <div className="section-title"><div><h2>Scan ulang & input gram</h2><p>Semua unit wajib terverifikasi sebelum finalisasi.</p></div><span className="verified"><CheckCircle2 size={16} /> 2/2 terverifikasi</span></div>
          <div className="return-list">
            <div className="return-item"><CheckCircle2 className="check" size={20} /><span><strong>Bambu Lab PLA Basic</strong><small>FLM-2608-0148 · Matte Black</small></span><label><small>Saldo sebelum</small><strong>812,00 g</strong></label><label><small>Gram digunakan</small><input type="number" min="0" max="812" step="0.01" value={usedA} onChange={(event) => setUsedA(Number(event.target.value))} /></label><label><small>Sisa setelah</small><strong>{(812 - usedA).toLocaleString("id-ID")} g</strong></label></div>
            <div className="return-item"><CheckCircle2 className="check" size={20} /><span><strong>Polymaker PolyLite</strong><small>FLM-2607-0204 · Army Green</small></span><label><small>Saldo sebelum</small><strong>672,00 g</strong></label><label><small>Gram digunakan</small><input type="number" min="0" max="672" step="0.01" value={usedB} onChange={(event) => setUsedB(Number(event.target.value))} /></label><label><small>Sisa setelah</small><strong>{(672 - usedB).toLocaleString("id-ID")} g</strong></label></div>
          </div>
        </section>
        <aside className="summary-panel">
          <div className="section-title"><div><h2>Hasil pekerjaan</h2><p>Data final sesi penggunaan.</p></div><ClipboardCheck size={20} /></div>
          <label className="stack-field"><span>Hasil</span><select defaultValue="SUCCESS"><option value="SUCCESS">Berhasil</option><option value="PARTIAL">Sebagian</option><option value="FAILED">Gagal</option><option value="CANCELLED">Dibatalkan</option></select></label>
          <label className="stack-field"><span>Catatan (opsional)</span><textarea placeholder="Catatan hasil print..." /></label>
          <dl className="cost-list"><div><dt>Total digunakan</dt><dd>{total.toLocaleString("id-ID")} g</dd></div><div><dt>Biaya penggunaan</dt><dd>Rp{Math.round(total * 203.87).toLocaleString("id-ID")}</dd></div><div><dt>Unit kembali tersedia</dt><dd>2 unit</dd></div></dl>
          <div className="summary-note safe"><ShieldCheck size={18} /><span>Finalisasi bersifat atomic dan aman dari pengurangan ganda.</span></div>
          <button className="button primary full" disabled={done} onClick={() => setDone(true)}>{done ? <><CheckCircle2 size={17} /> Sesi selesai</> : <><ClipboardCheck size={17} /> Finalisasi penggunaan</>}</button>
        </aside>
      </div>
      {done ? <Toast text="Penggunaan selesai. Ledger dan audit log berhasil dibuat." onClose={() => setDone(false)} /> : null}
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

export function ModuleView({ view }: { view: ViewId }) {
  if (view === "inventory") return <InventoryView />;
  if (view === "receipt") return <ReceiptView />;
  if (view === "usage-start") return <UsageStartView />;
  if (view === "usage-active") return <ActiveUsageView />;
  if (view === "usage-complete") return <CompleteUsageView />;
  if (view === "reports") return <ReportsView />;
  if (view === "history") return <ReportsView ledgerOnly />;
  if (view === "users") return <UsersView />;
  return <SettingsView />;
}

