"use client";
import Image from "next/image";
import Script from "next/script";
import { AlertCircle, LoaderCircle, LockKeyhole, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "./auth-provider";

type GoogleIdentity = { accounts: { id: {
  initialize: (options: { client_id: string; nonce: string; callback: (response: { credential: string }) => void; auto_select: boolean }) => void;
  renderButton: (element: HTMLElement, options: Record<string, unknown>) => void;
} } };
declare global { interface Window { google?: GoogleIdentity } }

export default function LoginView() {
  const auth = useAuth();
  const button = useRef<HTMLDivElement>(null);
  const [scriptReady, setScriptReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!scriptReady || !auth.configured || !auth.googleClientId) return;
    let active = true;
    async function prepare() {
      try {
        const response = await fetch("/api/v1/auth/challenge", { method: "POST" });
        const body = await response.json();
        if (!response.ok) throw new Error(body.message);
        if (!active || !button.current || !window.google) return;
        window.google.accounts.id.initialize({ client_id: auth.googleClientId!, nonce: body.nonce, auto_select: false, callback: async ({ credential }) => {
          setBusy(true); setError("");
          try {
            const response = await fetch("/api/v1/auth/google", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ credential }) });
            const body = await response.json();
            if (!response.ok) throw new Error(body.message ?? "Login belum berhasil.");
            auth.signedIn(body.user);
          } catch(failure) { setError(failure instanceof Error ? failure.message : "Login belum berhasil."); }
          finally { setBusy(false); }
        } });
        button.current.replaceChildren();
        window.google.accounts.id.renderButton(button.current, { type: "standard", theme: "outline", size: "large", text: "signin_with", shape: "pill", width: Math.min(320, button.current.clientWidth || 280), locale: "id" });
      } catch(failure) { if (active) setError(failure instanceof Error ? failure.message : "Login belum dapat dimulai."); }
    }
    void prepare();
    return () => { active = false; };
  // A new nonce is only generated for a new login attempt, not during session refreshes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scriptReady, auth.configured, auth.googleClientId, revision]);
  return <main className="login-shell">
    <section className="login-card" aria-labelledby="login-title">
      <Image className="login-logo" src="/tidigo-logo.png" alt="TIDIGO" width={280} height={92} priority />
      <span className="login-icon"><LockKeyhole size={26} /></span>
      <h1 id="login-title">Masuk ke Stok Filamen</h1>
      <p>Gunakan akun Google yang terdaftar di TIDIGO.</p>
      {auth.loading ? <div className="login-status"><LoaderCircle className="spin" size={21} /> Memuat akun...</div> : auth.error ? <div className="login-feedback" role="alert"><AlertCircle size={20} /><p>{auth.error}</p><button className="button secondary" onClick={() => void auth.refresh()}>Coba lagi</button></div> : !auth.configured ? <div className="login-feedback"><LockKeyhole size={22} /><strong>Akses akun sedang disiapkan</strong><p>Hubungi admin TIDIGO untuk mengaktifkan login.</p><button className="button secondary" onClick={() => void auth.refresh()}><RefreshCw size={16} /> Periksa kembali</button></div> : <>
        <Script src="https://accounts.google.com/gsi/client" onReady={() => setScriptReady(true)} onError={() => setError("Google belum dapat dimuat. Periksa koneksi lalu muat ulang halaman.")} />
        <div ref={button} className={`google-login${busy ? " is-busy" : ""}`} aria-busy={busy} />
        {busy ? <p className="login-status"><LoaderCircle className="spin" size={18} /> Memeriksa akun...</p> : null}
        {error ? <div className="login-feedback" role="alert"><p>{error}</p><button className="button secondary" onClick={() => { setError(""); setRevision(value => value + 1); }}>Coba login lagi</button></div> : null}
      </>}
      <small>Akses diberikan oleh admin sesuai tugas Anda.</small>
    </section>
    <p className="login-footer">TIDIGO · Pengelolaan stok & penggunaan filamen</p>
  </main>;
}
