"use client";
import { useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, LoaderCircle, LogOut, Pencil, Plus, Search, ShieldCheck, X } from "lucide-react";
import { roleLabels, roles, type AppUser, type AuditEvent, type UserRole } from "@/lib/account-types";
import { useAuth } from "./auth-provider";
import { formatDate } from "./report-state";
import { PasswordChangeForm, PasswordInput } from "./password-form";

export const initials = (name: string) => name.trim().split(/\s+/).map(word => word[0]).slice(0,2).join("").toUpperCase();
function AccountDialog({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  return <dialog ref={ref} className="account-dialog" onCancel={event => { event.preventDefault(); onClose(); }} aria-labelledby="account-dialog-title"><div className="dialog-head"><h2 id="account-dialog-title">{title}</h2><button className="icon-button" onClick={onClose} aria-label="Tutup"><X size={20} /></button></div>{children}</dialog>;
}
export function ProfileView() {
  const { user, logout } = useAuth();
  const [error, setError] = useState("");
  if (!user) return null;
  return <section className="account-profile form-panel"><span className="avatar account-avatar">{initials(user.name)}</span><h1>{user.name}</h1><p>{user.email}</p><span className="account-role"><ShieldCheck size={16} /> {roleLabels[user.role]}</span><dl><div><dt>Status akun</dt><dd>Aktif</dd></div><div><dt>Cara masuk</dt><dd>Email & kata sandi</dd></div><div><dt>Login terakhir</dt><dd>{user.lastLoginAt ? formatDate(user.lastLoginAt) : "—"}</dd></div></dl><p className="report-note">Hubungi Owner untuk memperbarui nama atau hak akses akun.</p><h2>Ubah kata sandi</h2><PasswordChangeForm />{error ? <p role="alert">{error}</p> : null}<button className="button secondary" onClick={() => void logout().catch(failure => setError(failure.message))}><LogOut size={17} /> Keluar dari akun</button></section>;
}
export function AccountsView() {
  const { user: self, refresh } = useAuth();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [revision, setRevision] = useState(0);
  const [editor, setEditor] = useState<AppUser | "new" | null>(null);
  const [form, setForm] = useState({ name: "", email: "", role: "COACH" as UserRole, status: "ACTIVE" as AppUser["status"], password: "" });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/v1/users", { cache: "no-store", signal: controller.signal }).then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.message); setUsers(data.users); setError(""); }).catch(failure => { if (!controller.signal.aborted) setError(failure.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [revision]);
  const open = (value: AppUser | "new") => { setEditor(value); setForm(value === "new" ? { name: "", email: "", role: "COACH", status: "ACTIVE", password: "" } : { name: value.name, email: value.email, role: value.role, status: value.status, password: "" }); setFormError(""); };
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); if (!editor) return;
    setSaving(true); setFormError("");
    try {
      const response = await fetch(editor === "new" ? "/api/v1/users" : `/api/v1/users/${editor.id}`, { method: editor === "new" ? "POST" : "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const data = await response.json(); if (!response.ok) throw new Error(data.message);
      setNotice(editor === "new" ? `${form.name} sudah terdaftar. Berikan email dan kata sandi sementara kepada staf secara pribadi.` : "Perubahan akun tersimpan.");
      setEditor(null); setRevision(value => value + 1); await refresh();
    } catch(failure) { setFormError(failure instanceof Error ? failure.message : "Akun belum dapat disimpan."); }
    finally { setSaving(false); }
  };
  const visible = users.filter(user => `${user.name} ${user.email}`.toLowerCase().includes(query.toLowerCase()));
  const protectedOwner = editor && editor !== "new" && editor.role === "OWNER";
  return <div className="accounts-view"><div className="module-heading"><div><span className="eyebrow">AKSES TIM</span><h1>Pengguna & hak akses</h1><p>Kelola akun staf, kata sandi sementara, dan hak aksesnya.</p></div><button className="button primary" onClick={() => open("new")}><Plus size={17} /> Tambah pengguna</button></div>
    <div className="account-role-grid">{roles.map(role => <article key={role}><ShieldCheck size={20} /><h2>{roleLabels[role]}</h2><p>{role === "OWNER" ? "Seluruh fitur, akun, dan hak akses." : role === "ADMIN" ? "Penerimaan, stok, penggunaan tim, dan laporan." : "Stok tersedia dan penggunaan pribadi."}</p></article>)}</div>
    {notice ? <p className="info-strip" role="status"><CheckCircle2 size={17} /> {notice}</p> : null}
    {error ? <div className="inventory-load-error" role="alert"><AlertCircle size={20} /> {error}<button className="button secondary" onClick={() => setRevision(value => value + 1)}>Coba lagi</button></div> : null}
    <section className="data-panel"><div className="toolbar"><label className="table-search"><Search size={17} /><input aria-label="Cari pengguna" placeholder="Cari nama atau email..." value={query} onChange={event => setQuery(event.target.value)} /></label></div><div className="table-wrap"><table className="data-table account-table"><thead><tr><th>Pengguna</th><th>Peran</th><th>Status</th><th>Login terakhir</th><th>Aksi</th></tr></thead><tbody>{loading ? <tr><td colSpan={5}><LoaderCircle className="spin" size={20} /> Memuat akun...</td></tr> : visible.map(user => <tr key={user.id}><td><div className="product-cell"><span className="avatar soft">{initials(user.name)}</span><span><strong>{user.name}{user.id === self?.id ? " (Anda)" : ""}</strong><small>{user.email}</small></span></div></td><td>{roleLabels[user.role]}</td><td><span className={`status ${user.status === "DISABLED" ? "warning" : "success"}`}><i />{user.status === "DISABLED" ? "Nonaktif" : user.mustChangePassword ? "Perlu ganti sandi" : "Aktif"}</span></td><td>{user.lastLoginAt ? formatDate(user.lastLoginAt) : "Belum pernah masuk"}</td><td><button className="mini-button" onClick={() => open(user)} aria-label={`Ubah akun ${user.name}`}><Pencil size={15} /> Ubah</button></td></tr>)}{!loading && !visible.length ? <tr><td colSpan={5}>Tidak ada pengguna yang sesuai.</td></tr> : null}</tbody></table></div></section>
    {editor ? <AccountDialog title={editor === "new" ? "Tambah pengguna" : "Ubah akun"} onClose={() => { if (!saving) setEditor(null); }}><form className="account-form" onSubmit={event => void save(event)}><label>Nama lengkap<input autoFocus required minLength={2} maxLength={120} value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></label><label>Email<input required type="email" maxLength={254} disabled={editor !== "new"} value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} placeholder="nama@contoh.com" /></label>{editor === "new" || editor.id !== self?.id ? <label>{editor === "new" ? "Kata sandi sementara" : "Reset kata sandi (opsional)"}<PasswordInput required={editor === "new"} minLength={12} maxLength={128} autoComplete="new-password" value={form.password} onChange={event => setForm({ ...form, password: event.target.value })} placeholder={editor === "new" ? "Minimal 12 karakter" : "Kosongkan jika tidak diubah"} /></label> : null}<label>Peran<select value={form.role} disabled={Boolean(protectedOwner)} onChange={event => setForm({ ...form, role: event.target.value as UserRole })}>{roles.map(role => <option value={role} key={role}>{roleLabels[role]}</option>)}</select></label>{editor !== "new" ? <label>Status<select value={form.status} disabled={Boolean(protectedOwner)} onChange={event => setForm({ ...form, status: event.target.value as AppUser["status"] })}><option value="ACTIVE">Aktif</option><option value="DISABLED">Nonaktif</option></select></label> : <p className="report-note">Bagikan email dan kata sandi sementara secara pribadi. Staf wajib membuat kata sandi pribadi saat pertama masuk.</p>}{protectedOwner ? <p className="report-note">Peran dan status Owner dilindungi agar pengelolaan akun tetap tersedia.</p> : null}{form.status === "DISABLED" ? <p className="report-note">Akses akan dihentikan. Riwayat transaksinya tetap tersimpan.</p> : null}{formError ? <p className="inventory-form-error" role="alert">{formError}</p> : null}<div className="dialog-actions"><button className="button secondary" type="button" disabled={saving} onClick={() => setEditor(null)}>Batal</button><button className="button primary" disabled={saving}>{saving ? <LoaderCircle className="spin" size={17} /> : null} Simpan akun</button></div></form></AccountDialog> : null}
  </div>;
}

const actions: Record<string,string> = { OWNER_CREATED: "Mengaktifkan akun Owner", PASSWORD_RESET: "Mereset kata sandi pengguna", PASSWORD_CHANGED: "Mengubah kata sandi pribadi", LOGIN: "Masuk ke aplikasi", USER_CREATED: "Menambahkan pengguna", USER_UPDATED: "Mengubah akun", STOCK_CREATED: "Menambahkan stok", STOCK_UPDATED: "Mengoreksi stok", STOCK_DELETED: "Menghapus stok", RECEIPT_CREATED: "Mencatat penerimaan", RECEIPT_UPDATED: "Mengubah penerimaan", RECEIPT_DELETED: "Menghapus penerimaan", USAGE_STARTED: "Memulai penggunaan", USAGE_COMPLETED: "Menyelesaikan penggunaan" };
const fields: Record<string,string> = { code:"Kode", product:"Produk", material:"Material", color:"Warna", packaging_type:"Kemasan", remaining_grams:"Sisa gram", status:"Status", unit_cost:"Harga unit", supplier:"Supplier", name:"Nama", email:"Email", role:"Peran", number:"Nomor", borrower:"Pengambil", activity:"Kegiatan", units:"Jumlah unit", result:"Hasil", invoice_number:"Invoice", receipt_number:"Nomor penerimaan" };
export function ActivityView() {
  const [events, setEvents] = useState<AuditEvent[]>([]), [error, setError] = useState(""), [loading,setLoading] = useState(true), [query,setQuery] = useState(""), [revision,setRevision] = useState(0);
  useEffect(() => { let active = true; fetch("/api/v1/activity", { cache:"no-store" }).then(async response => { const body = await response.json(); if (!response.ok) throw new Error(body.message); if(active) { setEvents(body.events); setError(""); } }).catch(failure => { if(active) setError(failure.message); }).finally(() => { if(active) setLoading(false); }); return () => { active=false; }; }, [revision]);
  const visible = events.filter(event => `${event.actorName} ${actions[event.action]} ${event.reason} ${JSON.stringify(event.after)}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="accounts-view"><div className="module-heading"><div><span className="eyebrow">PENGAWASAN</span><h1>Aktivitas pengguna</h1><p>200 aktivitas terbaru sejak sistem akun diaktifkan.</p></div><button className="button secondary" onClick={() => setRevision(value => value + 1)}>Muat ulang</button></div><label className="table-search account-search"><Search size={18} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Cari nama, kegiatan, atau kode..." /></label>{error ? <p className="inventory-form-error" role="alert">{error}</p> : null}<div className="account-activity-list">{loading ? <p><LoaderCircle className="spin" size={18} /> Memuat aktivitas...</p> : visible.length ? visible.map(event => <article key={event.id}><div className="account-activity-head"><span className="avatar soft">{initials(event.actorName)}</span><div><strong>{event.actorName}</strong><p>{actions[event.action] ?? event.action}</p></div><time>{formatDate(event.createdAt)}</time></div>{event.reason ? <p><strong>Alasan:</strong> {event.reason}</p> : null}{event.before || event.after ? <details><summary>Lihat rincian perubahan</summary><div className="table-wrap"><table className="data-table"><thead><tr><th>Data</th><th>Sebelum</th><th>Sesudah</th></tr></thead><tbody>{Array.from(new Set([...Object.keys(event.before ?? {}), ...Object.keys(event.after ?? {})])).filter(key => fields[key]).map(key => <tr key={key}><td>{fields[key]}</td><td>{String(event.before?.[key] ?? "—")}</td><td>{String(event.after?.[key] ?? "—")}</td></tr>)}</tbody></table></div></details> : null}</article>) : <div className="report-empty">Belum ada aktivitas yang sesuai.</div>}</div></div>;
}
