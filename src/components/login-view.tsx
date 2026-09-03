"use client";
import Image from "next/image";
import { AlertCircle, LoaderCircle, LockKeyhole, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "./auth-provider";
import { PasswordInput } from "./password-form";

export default function LoginView() {
  const auth = useAuth();
  const [form, setForm] = useState({ email: "", password: "", confirmation: "", name: "", setupToken: "" });
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [help, setHelp] = useState(false);
  const activationToken = useRef<string | null>(null);
  useEffect(() => {
    // Activation secrets stay in the URL fragment, never in request URLs or referrers.
    const token = activationToken.current ?? new URLSearchParams(window.location.hash.slice(1)).get("setup");
    if (!token) return;
    activationToken.current = token;
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    const timer = window.setTimeout(() => setForm(previous => ({ ...previous, setupToken: token })), 0);
    return () => window.clearTimeout(timer);
  }, []);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError("");
    if (auth.setupRequired && form.password !== form.confirmation) { setError("Konfirmasi kata sandi belum sama."); return; }
    setBusy(true);
    try {
      const response = await fetch(auth.setupRequired ? "/api/v1/auth/setup" : "/api/v1/auth/login", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(auth.setupRequired ? { name: form.name, email: form.email, password: form.password, setupToken: form.setupToken } : { email: form.email, password: form.password }),
      });
      const body = await response.json();
      if (!response.ok) { if (response.status === 409) await auth.refresh(); throw new Error(body.message); }
      auth.signedIn(body.user);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Belum dapat masuk. Silakan coba lagi."); }
    finally { setBusy(false); }
  }
  return <main className="login-shell"><section className="login-card" aria-labelledby="login-title">
    <Image className="login-logo" src="/tidigo-logo.png" alt="TIDIGO" width={280} height={92} priority />
    <span className="login-icon"><LockKeyhole size={26} /></span>
    <h1 id="login-title">{auth.configured && auth.setupRequired ? "Buat akun Owner" : "Masuk ke Stok Filamen"}</h1>
    <p>{auth.configured && auth.setupRequired ? "Tentukan email dan kata sandi Anda untuk mulai mengelola TIDIGO." : "Masuk dengan email dan kata sandi akun TIDIGO."}</p>
    {auth.loading ? <div className="login-status"><LoaderCircle className="spin" size={21} /> Memuat akun...</div> : auth.error ? <div className="login-feedback" role="alert"><AlertCircle size={20} /><p>{auth.error}</p><button className="button secondary" onClick={() => void auth.refresh()}>Coba lagi</button></div> : !auth.configured ? <div className="login-feedback"><strong>Akses akun sedang disiapkan</strong><p>Hubungi pengelola TIDIGO untuk mengaktifkan akun pertama.</p><button className="button secondary" onClick={() => void auth.refresh()}><RefreshCw size={16} /> Periksa kembali</button></div> : <form className="account-form login-form" onSubmit={event => void submit(event)}>
      {auth.setupRequired ? <><label>Kode aktivasi<input required maxLength={256} autoComplete="off" type="password" value={form.setupToken} onChange={event => setForm({ ...form, setupToken: event.target.value })} /></label><label>Nama lengkap<input required autoComplete="name" minLength={2} maxLength={120} value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></label></> : null}
      <label>Email<input required name="email" type="email" autoComplete="username" maxLength={254} value={form.email} placeholder="nama@contoh.com" onChange={event => setForm({ ...form, email: event.target.value })} /></label>
      <label>Kata sandi<PasswordInput required name="password" autoComplete={auth.setupRequired ? "new-password" : "current-password"} minLength={auth.setupRequired ? 12 : undefined} maxLength={128} value={form.password} onChange={event => setForm({ ...form, password: event.target.value })} /></label>
      {auth.setupRequired ? <><small>Gunakan 12–128 karakter untuk kata sandi.</small><label>Ulangi kata sandi<PasswordInput required autoComplete="new-password" minLength={12} maxLength={128} value={form.confirmation} onChange={event => setForm({ ...form, confirmation: event.target.value })} /></label></> : null}
      {error ? <p className="inventory-form-error" role="alert">{error}</p> : null}
      <button className="button primary" disabled={busy}>{busy ? <LoaderCircle className="spin" size={18} /> : null}{auth.setupRequired ? "Buat akun & masuk" : "Masuk"}</button>
      {!auth.setupRequired ? <button type="button" className="login-help" onClick={() => setHelp(!help)}>Lupa kata sandi?</button> : null}
      {help ? <p className="report-note" role="status">Hubungi Owner TIDIGO untuk mendapatkan kata sandi sementara. Setelah masuk, buat kata sandi pribadi yang baru.</p> : null}
    </form>}
    <small>{auth.setupRequired ? "Aktivasi akun pertama hanya dapat dilakukan sekali." : "Akun staf dibuat oleh Owner sesuai tugas Anda."}</small>
  </section><p className="login-footer">TIDIGO · Pengelolaan stok & penggunaan filamen</p></main>;
}
