"use client";
import { useState, type InputHTMLAttributes } from "react";
import { Eye, EyeOff, LoaderCircle, LockKeyhole, LogOut } from "lucide-react";
import { useAuth } from "./auth-provider";

export function PasswordInput(props: InputHTMLAttributes<HTMLInputElement>) {
  const [visible, setVisible] = useState(false);
  return <span className="password-input"><input {...props} type={visible ? "text" : "password"} /><button type="button" className="icon-button" aria-label={visible ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"} aria-pressed={visible} onClick={() => setVisible(!visible)}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button></span>;
}
export function PasswordChangeForm() {
  const { user, signedIn } = useAuth();
  const [form, setForm] = useState({ currentPassword: "", password: "", confirmation: "" });
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError(""); setNotice("");
    if (form.password !== form.confirmation) { setError("Konfirmasi kata sandi belum sama."); return; }
    setBusy(true);
    try {
      const response = await fetch("/api/v1/auth/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword: form.currentPassword, password: form.password }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message);
      setForm({ currentPassword: "", password: "", confirmation: "" });
      setNotice("Kata sandi diperbarui. Sesi pada perangkat lain telah diakhiri.");
      signedIn(body.user);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Kata sandi belum dapat diubah."); }
    finally { setBusy(false); }
  }
  return <form className="account-form password-change-form" onSubmit={event => void submit(event)}>
    <input type="hidden" name="username" autoComplete="username" value={user?.email ?? ""} />
    <label>Kata sandi saat ini<PasswordInput required autoComplete="current-password" maxLength={128} value={form.currentPassword} onChange={event => setForm({ ...form, currentPassword: event.target.value })} /></label>
    <label>Kata sandi baru<PasswordInput required autoComplete="new-password" minLength={12} maxLength={128} value={form.password} onChange={event => setForm({ ...form, password: event.target.value })} /></label>
    <small>Gunakan 12–128 karakter. Kalimat yang mudah diingat juga bisa.</small>
    <label>Ulangi kata sandi baru<PasswordInput required autoComplete="new-password" minLength={12} maxLength={128} value={form.confirmation} onChange={event => setForm({ ...form, confirmation: event.target.value })} /></label>
    {error ? <p className="inventory-form-error" role="alert">{error}</p> : null}
    {notice ? <p className="info-strip" role="status">{notice}</p> : null}
    <button className="button primary" disabled={busy}>{busy ? <LoaderCircle className="spin" size={17} /> : <LockKeyhole size={17} />} Simpan kata sandi</button>
  </form>;
}
export function PasswordChangeScreen() {
  const { user, logout } = useAuth();
  const [error, setError] = useState("");
  return <main className="login-shell"><section className="login-card"><span className="login-icon"><LockKeyhole size={26} /></span><h1>Buat kata sandi pribadi</h1><p>Halo {user?.name}. Ganti kata sandi sementara untuk mulai menggunakan TIDIGO.</p><PasswordChangeForm />{error ? <p role="alert">{error}</p> : null}<button className="button secondary" onClick={() => void logout().catch(failure => setError(failure.message))}><LogOut size={16} /> Keluar</button></section></main>;
}
